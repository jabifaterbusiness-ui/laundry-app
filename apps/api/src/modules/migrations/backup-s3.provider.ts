import { createHash, createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

export interface S3CompatibleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface S3CompatibleConfig {
  endpoint: string;
  region: string;
  bucket: string;
}

export interface S3UploadResult {
  storageKey: string;
  etag: string | null;
}

const REQUEST_TIMEOUT_MS = 15_000;
const UNSAFE_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".test",
  ".invalid",
];

function fail(message: string): never {
  throw new Error(message);
}

function validateInputs(
  config: S3CompatibleConfig,
  credentials: S3CompatibleCredentials,
): URL {
  if (
    !config ||
    typeof config.endpoint !== "string" ||
    typeof config.region !== "string" ||
    typeof config.bucket !== "string"
  ) {
    fail("Invalid S3-compatible storage configuration.");
  }

  if (
    !credentials ||
    typeof credentials.accessKeyId !== "string" ||
    !credentials.accessKeyId.trim() ||
    typeof credentials.secretAccessKey !== "string" ||
    !credentials.secretAccessKey
  ) {
    fail("S3-compatible storage credentials are incomplete.");
  }

  if (
    credentials.accessKeyId.length > 256 ||
    credentials.secretAccessKey.length > 4096 ||
    (credentials.sessionToken !== undefined &&
      (typeof credentials.sessionToken !== "string" ||
        !credentials.sessionToken ||
        credentials.sessionToken.length > 8192))
  ) {
    fail("Invalid S3-compatible storage credentials.");
  }

  if (
    !/^[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(
      config.bucket,
    ) ||
    config.bucket.includes("..") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(config.bucket)
  ) {
    fail("Invalid S3-compatible bucket name.");
  }

  if (
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(config.region)
  ) {
    fail("Invalid S3-compatible region.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    fail("Invalid S3-compatible endpoint.");
  }

  const hostname = endpoint.hostname.toLowerCase();

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/" ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".") ||
    UNSAFE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    hostname.includes(":") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    !hostname.includes(".")
  ) {
    fail(
      "The S3-compatible endpoint must be a public HTTPS hostname without credentials, a path, query, or fragment.",
    );
  }

  return endpoint;
}

const NON_PUBLIC_IPV4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

function ipv4ToNumber(address: string): number {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return -1;
  }
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function isPublicIPv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value < 0) return false;

  return !NON_PUBLIC_IPV4_CIDRS.some(([network, prefix]) => {
    const networkValue = ipv4ToNumber(network);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (networkValue & mask);
  });
}

async function resolvePublicIPv4(hostname: string): Promise<string> {
  let addresses: Awaited<ReturnType<typeof lookup>>[];
  try {
    addresses = await lookup(hostname, { all: true, family: 4, verbatim: true });
  } catch {
    throw new Error("S3-compatible storage hostname could not be resolved.");
  }

  if (
    addresses.length === 0 ||
    addresses.some((entry) => !isPublicIPv4(entry.address))
  ) {
    throw new Error("S3-compatible storage endpoint must resolve only to public IPv4 addresses.");
  }

  return addresses[0]!.address;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalPath(bucket: string, key?: string): string {
  const segments = [bucket, ...(key ? key.split("/") : [])];
  return `/${segments.map(awsEncode).join("/")}`;
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function createSignedHeaders(input: {
  method: "HEAD" | "PUT" | "DELETE";
  url: URL;
  config: S3CompatibleConfig;
  credentials: S3CompatibleCredentials;
  payload: Buffer;
  now?: Date;
}): Record<string, string> {
  const now = input.now ?? new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.payload);

  const headers: Record<string, string> = {
    host: input.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (input.method === "PUT") {
    headers["content-type"] = "application/octet-stream";
  }

  if (input.credentials.sessionToken) {
    headers["x-amz-security-token"] =
      input.credentials.sessionToken;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]!.trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    input.method,
    input.url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(
      input.credentials.secretAccessKey,
      dateStamp,
      input.config.region,
    ),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    ...Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name === "host" ? "Host" : name,
        value,
      ]),
    ),
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function request(
  method: "HEAD" | "PUT" | "DELETE",
  config: S3CompatibleConfig,
  credentials: S3CompatibleCredentials,
  key?: string,
  body: Buffer = Buffer.alloc(0),
): Promise<Response> {
  const endpoint = validateInputs(config, credentials);
  const url = new URL(endpoint.origin);
  url.pathname = canonicalPath(config.bucket, key);

  const headers = createSignedHeaders({
    method,
    url,
    config,
    credentials,
    payload: body,
  });

  try {
    const pinnedAddress = await resolvePublicIPv4(endpoint.hostname);

    return await new Promise<Response>((resolve, reject) => {
      const req = httpsRequest(
        {
          protocol: "https:",
          hostname: endpoint.hostname,
          port: endpoint.port || 443,
          path: `${url.pathname}${url.search}`,
          method,
          headers,
          servername: endpoint.hostname,
          rejectUnauthorized: true,
          timeout: REQUEST_TIMEOUT_MS,
          lookup: (_hostname, _options, callback) => {
            callback(null, pinnedAddress, 4);
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            const responseHeaders = new Headers();
            const etag = res.headers.etag;
            if (typeof etag === "string") responseHeaders.set("etag", etag);
            resolve(new Response(null, {
              status: res.statusCode ?? 502,
              headers: responseHeaders,
            }));
          });
        },
      );

      req.on("timeout", () => req.destroy(new Error("Request timed out.")));
      req.on("error", () => reject(
        new Error("S3-compatible storage request failed or timed out."),
      ));
      if (method === "PUT") req.write(body);
      req.end();
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("public IPv4") ||
        error.message.includes("hostname could not be resolved"))
    ) {
      throw error;
    }
    throw new Error("S3-compatible storage request failed or timed out.");
  }
}

/**
 * Verifies actual access to the configured bucket.
 * A connection is not considered verified until this request succeeds.
 */
export async function verifyS3CompatibleBucket(
  config: S3CompatibleConfig,
  credentials: S3CompatibleCredentials,
): Promise<void> {
  const response = await request("HEAD", config, credentials);

  if (!response.ok) {
    throw new Error(
      `S3-compatible bucket verification failed (HTTP ${response.status}).`,
    );
  }
}

/**
 * Uploads already-encrypted backup bytes. This function does not encrypt
 * data itself and never includes credentials or signed headers in errors.
 */
/**
 * Deletes only internally generated encrypted backup objects. Arbitrary keys
 * are rejected to prevent a caller from deleting unrelated bucket contents.
 */
export async function deleteS3CompatibleArtifact(input: {
  config: S3CompatibleConfig;
  credentials: S3CompatibleCredentials;
  storageKey: string;
}): Promise<void> {
  if (!/^backups\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.enc$/i.test(input.storageKey)) {
    fail("Invalid S3-compatible backup object key.");
  }

  const response = await request(
    "DELETE",
    input.config,
    input.credentials,
    input.storageKey,
  );

  if (!response.ok) {
    throw new Error(
      `S3-compatible backup deletion failed (HTTP ${response.status}).`,
    );
  }
}

export async function uploadS3CompatibleArtifact(input: {
  config: S3CompatibleConfig;
  credentials: S3CompatibleCredentials;
  storageKey: string;
  encryptedArtifact: Buffer;
}): Promise<S3UploadResult> {
  if (
    !input.storageKey ||
    input.storageKey.length > 1024 ||
    input.storageKey.startsWith("/") ||
    input.storageKey.split("/").some(
      (part) => !part || part === "." || part === "..",
    )
  ) {
    fail("Invalid S3-compatible backup object key.");
  }

  if (
    !Buffer.isBuffer(input.encryptedArtifact) ||
    input.encryptedArtifact.length === 0
  ) {
    fail("Encrypted backup artifact is empty or invalid.");
  }

  const response = await request(
    "PUT",
    input.config,
    input.credentials,
    input.storageKey,
    input.encryptedArtifact,
  );

  if (!response.ok) {
    throw new Error(
      `S3-compatible backup upload failed (HTTP ${response.status}).`,
    );
  }

  return {
    storageKey: input.storageKey,
    etag: response.headers.get("etag"),
  };
}
