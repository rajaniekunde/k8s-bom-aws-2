const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const S3_BUCKET = process.env.S3_BUCKET || "test-kbom-reports-bucket-7feb2025";
const KBOM_FILE = "k8s_bom.json";

exports.handler = async (event) => {
    try {
        const path = event.rawPath || "/";
        const pathParts = path.replace(/^\/+|\/+$/g, '').split('/');

        if (path === "/" || path === "/bom") {
            return await fetchFullKBOM();
        } else if (pathParts.length === 2 && pathParts[0] === "bom") {
            return await fetchComponentData(pathParts[1]);
        } else if (pathParts.length === 3 && pathParts[0] === "bom") {
            return await fetchResourceData(pathParts[1], pathParts[2]);
        } else {
            return createResponse(400, { error: "Invalid request path" });
        }
    } catch (error) {
        return createResponse(500, { error: error.message });
    }
};

async function fetchFullKBOM() {
    try {
        const data = await s3.getObject({ Bucket: S3_BUCKET, Key: KBOM_FILE }).promise();
        return createResponse(200, JSON.parse(data.Body.toString('utf-8')));
    } catch (error) {
        return handleS3Error(error);
    }
}

async function fetchComponentData(component) {
    try {
        const data = await s3.getObject({ Bucket: S3_BUCKET, Key: KBOM_FILE }).promise();
        const kbomData = JSON.parse(data.Body.toString('utf-8'));

        const componentData = kbomData.kbom.components?.find(c => c.name === component);
        if (!componentData) {
            return createResponse(404, { error: `Component '${component}' not found` });
        }

        return createResponse(200, componentData);
    } catch (error) {
        return handleS3Error(error);
    }
}

async function fetchResourceData(component, resourceName) {
    try {
        const data = await s3.getObject({ Bucket: S3_BUCKET, Key: KBOM_FILE }).promise();
        const kbomData = JSON.parse(data.Body.toString('utf-8'));

        const componentData = kbomData.kbom.components?.find(c => c.name === component);
        if (!componentData) {
            return createResponse(404, { error: `Component '${component}' not found` });
        }

        const resourceData = componentData.dependencies?.find(dep => dep.name === resourceName);
        if (!resourceData) {
            return createResponse(404, { error: `Resource '${resourceName}' not found in component '${component}'` });
        }

        return createResponse(200, resourceData);
    } catch (error) {
        return handleS3Error(error);
    }
}

function handleS3Error(error) {
    if (error.code === 'NoSuchKey') {
        return createResponse(404, { error: `File ${KBOM_FILE} not found` });
    }
    return createResponse(500, { error: error.message });
}

function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    };
}
