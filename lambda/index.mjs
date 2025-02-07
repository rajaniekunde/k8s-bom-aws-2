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
            return await fetchComponentVulnerabilities(pathParts[1]);
        } else if (pathParts.length === 3 && pathParts[0] === "vulnerabilities" && pathParts[1] === "cve") {
            return await fetchVulnerabilityByCVE(pathParts[2]);
        } else if (pathParts.length === 3 && pathParts[0] === "vulnerabilities" && pathParts[1] === "severity") {
            return await fetchVulnerabilitiesBySeverity(pathParts[2]);
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
    const componentData = kbomData.kbom.components?.find(c => c.name === component);
    return componentData ? createResponse(200, componentData) : createResponse(404, { error: `Component '${component}' not found` });
}

async function fetchResourceData(component, resourceName) {
    const kbomData = await fetchKBOMData();
    const componentData = kbomData.kbom.components?.find(c => c.name === component);
    const resourceData = componentData?.dependencies?.find(dep => dep.name === resourceName);
    return resourceData ? createResponse(200, resourceData) : createResponse(404, { error: `Resource '${resourceName}' not found in component '${component}'` });
}

async function fetchAllVulnerabilities() {
    const kbomData = await fetchKBOMData();
    return createResponse(200, kbomData.vulnerabilities || []);
}

async function fetchComponentVulnerabilities(component) {
    const kbomData = await fetchKBOMData();
    const vulnerabilities = kbomData.vulnerabilities?.filter(vuln => vuln.component === component);
    return vulnerabilities?.length ? createResponse(200, vulnerabilities) : createResponse(404, { error: `No vulnerabilities found for '${component}'` });
}

async function fetchVulnerabilityByCVE(cveId) {
    const kbomData = await fetchKBOMData();
    const vulnerability = kbomData.vulnerabilities?.find(vuln => vuln.cve === cveId);
    return vulnerability ? createResponse(200, vulnerability) : createResponse(404, { error: `Vulnerability '${cveId}' not found` });
}

async function fetchVulnerabilitiesBySeverity(severity) {
    const kbomData = await fetchKBOMData();
    const vulnerabilities = kbomData.vulnerabilities?.filter(vuln => vuln.severity.toLowerCase() === severity.toLowerCase());
    return vulnerabilities?.length ? createResponse(200, vulnerabilities) : createResponse(404, { error: `No vulnerabilities with severity '${severity}' found` });
}

async function fetchKBOMData() {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: KBOM_FILE });
    const data = await s3.send(command);
    return JSON.parse(await streamToString(data.Body));
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
