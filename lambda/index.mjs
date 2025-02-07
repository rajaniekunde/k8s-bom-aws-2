import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const S3_BUCKET = process.env.S3_BUCKET || "kbom-reports-bucket-1243";
const KBOM_FILE = "k8s_bom.json";

export const handler = async (event) => {
    try {
        const path = event.rawPath || "/";
        const pathParts = path.replace(/^\/+/g, '').split('/');

        if (path === "/" || path === "/bom") {
            return await fetchFullKBOM();
        } else if (pathParts.length === 2 && pathParts[0] === "bom") {
            return await fetchComponentData(pathParts[1]);
        } else if (pathParts.length === 3 && pathParts[0] === "bom") {
            return await fetchResourceData(pathParts[1], pathParts[2]);
        } else if (path === "/vulnerabilities") {
            return await fetchAllVulnerabilities();
        } else if (pathParts.length === 2 && pathParts[0] === "vulnerabilities") {
            return await fetchVulnerabilityById(pathParts[1]);
        } else if (pathParts.length === 3 && pathParts[0] === "vulnerabilities" && pathParts[1] === "severity") {
            return await fetchVulnerabilitiesBySeverity(pathParts[2]);
        } else if (path === "/bom/metadata") {
            return await fetchMetadata();
        } else if (path === "/bom/dependencies") {
            return await fetchDependencies();
        } else if (path === "/bom/tools") {
            return await fetchTools();
        } else if (path === "/bom/schema") {
            return await fetchSchema();
        } else {
            return createResponse(400, { error: "Invalid request path" });
        }
    } catch (error) {
        console.error("Error occurred:", error);
        return createResponse(500, { error: error.message });
    }
};

async function fetchFullKBOM() {
    return await fetchKBOMData();
}

async function fetchComponentData(component) {
    const kbomData = await fetchKBOMData();
    const components = kbomData.kbom.components || [];
    const componentData = components.find(c => c.name === component);
    return componentData ? createResponse(200, componentData) : createResponse(404, { error: `Component '${component}' not found` });
}

async function fetchResourceData(component, resource) {
    const kbomData = await fetchKBOMData();
    const components = kbomData.kbom.components || [];
    const componentData = components.find(c => c.name === component);
    const resourceData = componentData?.dependencies?.find(dep => dep.name === resource);
    return resourceData ? createResponse(200, resourceData) : createResponse(404, { error: `Resource '${resource}' not found in component '${component}'` });
}

async function fetchAllVulnerabilities() {
    const kbomData = await fetchKBOMData();
    const vulnerabilities = extractVulnerabilities(kbomData);
    return createResponse(200, vulnerabilities);
}

async function fetchVulnerabilityById(id) {
    const kbomData = await fetchKBOMData();
    const vulnerabilities = extractVulnerabilities(kbomData);
    const vulnerability = vulnerabilities.find(vuln => vuln.VulnerabilityID === id);
    return vulnerability ? createResponse(200, vulnerability) : createResponse(404, { error: `Vulnerability '${id}' not found` });
}

async function fetchVulnerabilitiesBySeverity(severity) {
    const kbomData = await fetchKBOMData();
    const vulnerabilities = extractVulnerabilities(kbomData);
    const filteredVulnerabilities = vulnerabilities.filter(vuln => vuln.Severity?.toLowerCase() === severity.toLowerCase());
    return filteredVulnerabilities.length ? createResponse(200, filteredVulnerabilities) : createResponse(404, { error: `No vulnerabilities with severity '${severity}' found` });
}

async function fetchMetadata() {
    const kbomData = await fetchKBOMData();
    return kbomData.kbom.metadata ? createResponse(200, kbomData.kbom.metadata) : createResponse(404, { error: "Metadata not found" });
}

async function fetchDependencies() {
    const kbomData = await fetchKBOMData();
    return kbomData.kbom.dependencies ? createResponse(200, kbomData.kbom.dependencies) : createResponse(404, { error: "Dependencies not found" });
}

async function fetchTools() {
    const kbomData = await fetchKBOMData();
    return kbomData.kbom.metadata?.tools ? createResponse(200, kbomData.kbom.metadata.tools) : createResponse(404, { error: "Tools not found" });
}

async function fetchSchema() {
    const kbomData = await fetchKBOMData();
    return kbomData.kbom.$schema ? createResponse(200, kbomData.kbom.$schema) : createResponse(404, { error: "Schema not found" });
}

async function fetchKBOMData() {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: KBOM_FILE });
    const data = await s3.send(command);
    return JSON.parse(await streamToString(data.Body));
}

function extractVulnerabilities(kbomData) {
    const results = kbomData.vulnerabilities?.Results || [];
    return results.flatMap(result => result.Vulnerabilities || []);
}

async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", reject);
    });
}

function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    };
}