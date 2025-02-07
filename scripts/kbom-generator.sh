#!/bin/bash

# Define output directory
OUTPUT_DIR="kbom_output"
S3_BUCKET="test-kbom-reports-bucket-7feb2025"
mkdir -p $OUTPUT_DIR

# Get the current Kubernetes context
K8S_CONTEXT=$(kubectl config current-context)

# Step 1: Generate KBOM for the Kubernetes Cluster
echo "Generating KBOM for Kubernetes Cluster using context: $K8S_CONTEXT..."
trivy k8s $K8S_CONTEXT --format cyclonedx --output $OUTPUT_DIR/kbom-cluster.json

# Step 2: Generate SBOM for Running Container Images
echo "Listing all running container images..."
kubectl get pods --all-namespaces -o jsonpath="{..image}" | tr -s '[[:space:]]' '\n' | sort | uniq > $OUTPUT_DIR/images.txt

echo "Generating SBOMs for container images..."
while read -r image; do
    safe_image_name=$(echo $image | tr '/:' '-' )
    trivy image "$image" --format cyclonedx -o "$OUTPUT_DIR/sbom-${safe_image_name}.json"
    echo "SBOM generated for $image"
done < $OUTPUT_DIR/images.txt

# Step 3: Perform Vulnerability Scanning

# Scan KBOM for Vulnerabilities
echo "Scanning KBOM for vulnerabilities..."
trivy sbom $OUTPUT_DIR/kbom-cluster.json --format json --output $OUTPUT_DIR/vulnerabilities-cluster.json

# Scan Each SBOM for Vulnerabilities
echo "Scanning SBOMs for vulnerabilities..."
for sbom in $OUTPUT_DIR/sbom-*.json; do
    vuln_output="$OUTPUT_DIR/vulnerabilities-$(basename "$sbom" .json).json"
    trivy sbom "$sbom" --format json --output "$vuln_output"
    echo "Vulnerability scan completed for $sbom"
done

# Step 4: Merge KBOM, SBOM, and Vulnerability Reports in Chunks

# Merge KBOM and SBOM files incrementally
echo "Merging KBOM and SBOM files incrementally..."
cp $OUTPUT_DIR/kbom-cluster.json $OUTPUT_DIR/combined-bom.json
for sbom in $OUTPUT_DIR/sbom-*.json; do
    tmp_file="$OUTPUT_DIR/tmp_combined.json"
    jq -s 'add' $OUTPUT_DIR/combined-bom.json "$sbom" > "$tmp_file" && mv "$tmp_file" $OUTPUT_DIR/combined-bom.json
    echo "Merged $sbom into combined-bom.json"
done

# Merge vulnerability reports incrementally
echo "Merging vulnerability reports incrementally..."
cp $OUTPUT_DIR/vulnerabilities-cluster.json $OUTPUT_DIR/combined-vulnerabilities.json
for vuln in $OUTPUT_DIR/vulnerabilities-*.json; do
    tmp_file="$OUTPUT_DIR/tmp_combined_vuln.json"
    jq -s 'add' $OUTPUT_DIR/combined-vulnerabilities.json "$vuln" > "$tmp_file" && mv "$tmp_file" $OUTPUT_DIR/combined-vulnerabilities.json
    echo "Merged $vuln into combined-vulnerabilities.json"
done

# Final merged report

# Generating final merged report
echo "Generating final merged report..."
jq -n \
  --slurpfile kbom $OUTPUT_DIR/combined-bom.json \
  --slurpfile vulnerabilities $OUTPUT_DIR/combined-vulnerabilities.json \
  '{kbom: $kbom[0], vulnerabilities: $vulnerabilities[0]}' > $OUTPUT_DIR/k8s_bom.json

# Upload KBOM to S3
echo "Uploading KBOM to S3 bucket: $S3_BUCKET..."
aws s3 cp $OUTPUT_DIR/k8s_bom.json s3://$S3_BUCKET/k8s_bom.json

echo "KBOM generation, vulnerability scanning, and S3 upload completed successfully! Final report: $OUTPUT_DIR/k8s_bom.json"
