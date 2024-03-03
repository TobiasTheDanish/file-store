import { Progress, Upload } from "@aws-sdk/lib-storage";
import { AbortMultipartUploadCommandOutput, BucketLocationConstraint, CompleteMultipartUploadCommandOutput, CreateBucketCommand, CreateBucketCommandInput, CreateBucketCommandOutput, DeleteBucketCommand, DeleteBucketCommandOutput, DeleteObjectCommand, DeleteObjectCommandInput, DeletePublicAccessBlockCommand, GetObjectCommand, GetObjectCommandInput, ObjectCannedACL, PutObjectAclCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

export type CreateBucketOutput = CreateBucketCommandOutput;

/**
 * The content of the actual file.
 */
export type ObjectBody = string | Uint8Array | Buffer | Readable;
/**
 * The possible file access modifiers.
 */
export type ObjectAccess = ObjectCannedACL;

/**
 * Available regions for the bucket to be located.
 */
export type BucketRegion = BucketLocationConstraint;

/**
 * Configuration interface for creating a new bucket.
 * @prop {string} bucketName - The name of the bucket to create.
 */
export interface CreateBucketConfig {
	bucketName: string,
}

/**
 * Base configuration interface.
 * @prop {string} bucket - The name of the bucket to interact with.
 * @prop {string} key    - The key for accessing the object.
 */
interface ObjectConfig {
	bucket: string,
	key: string,
}

/**
 * Options for server side encryption of files.
 */
export type ServerSideEncryptionOptions = "AES256" | "aws:kms" | "aws:kms:dsse";

/**
 * Configuration interface for uploading of files.
 * @extends ObjectConfig
 * @prop {object} body                   - The content of the file to upload
 * @prop {string} objectAccess           - Options include: "private" | "authenticated-read" | "aws-exec-read" | "bucket-owner-full-control" | "bucket-owner-read" | "public-read" | "public-read-write" 
 * @prop {string} [serverSideEncryption] - Options include: "AES256" | "aws:kms" | "aws:kms:dsse". "AES256" is default.
 */
export interface UploadConfig extends ObjectConfig {
	body: ObjectBody,
	objectAccess: ObjectAccess,
	serverSideEncryption?: ServerSideEncryptionOptions,
}

/**
 * @interface to specify user credentials
 * @prop {string} accessKeyId     - The id of the access key with relevant permissions
 * @prop {string} secretAccessKey - The secret access key
 * @prop {Date}   [expiration]    - Optional
 * @prop {string} [sessionToken]  - Optional
 */
export interface Credentials {
	accessKeyId: string,
	secretAccessKey: string,
	expiration?: Date,
	sessionToken?: string,
}

export interface S3Config {
	region: BucketRegion,
	credentials: Credentials,
}

export const Client = class {
	config: S3Config;
	s3: S3Client;

	constructor(config: S3Config) {
		this.config = config;
		this.s3 = new S3Client(config);
	}

	async createBucket(config: CreateBucketConfig): Promise<CreateBucketOutput> {

		const bucketConfig: CreateBucketCommandInput = {
			Bucket: config.bucketName,
			CreateBucketConfiguration: {
				LocationConstraint: this.config.region,
			},
			ObjectOwnership: "BucketOwnerPreferred",
		};

		const createCmd = new CreateBucketCommand(bucketConfig);
		const res = await this.s3.send(createCmd)
			.then((response) => response)
			.catch((e) => {
				return Promise.reject({message: "Could not create new bucket.", error: e});
		});

		const deletePABCmd = new DeletePublicAccessBlockCommand({Bucket: config.bucketName});
		return await this.s3.send(deletePABCmd)
			.then(() => res)
			.catch((e) => {
				return Promise.reject({message: `Could not delete public access block from bucket :'${config.bucketName}'.`, error: e});
			});
	}

	async deleteBucket(bucket: string): Promise<DeleteBucketCommandOutput> {
		const cmd = new DeleteBucketCommand({Bucket: bucket});
		return this.s3.send(cmd);
	}

	async upload(config: UploadConfig, cb?: ((progress: Progress) => void) ): Promise<AbortMultipartUploadCommandOutput | CompleteMultipartUploadCommandOutput> {
		const uploadClient = new Upload({
			client: this.s3,
			params: {
				Bucket: config.bucket,
				Key: config.key,
				Body: config.body,
				ServerSideEncryption: config.serverSideEncryption || "AES256",
			},
		});

		uploadClient.on("httpUploadProgress", cb);

		const res = await uploadClient.done();

		const putACLCmd = new PutObjectAclCommand({Bucket: config.bucket, Key: config.key, ACL: config.objectAccess});
		return await this.s3.send(putACLCmd)
			.then(() => res)
			.catch((e) => {
				return Promise.reject({message: `Could not set access level for object: '${config.key}' in bucket: '${config.bucket}'`, error: e});
		})
	}

	async download(config: ObjectConfig): Promise<Uint8Array> {
		const downloadConfig: GetObjectCommandInput = {
			Bucket: config.bucket,
			Key: config.key,
		}

		const getObjCmd = new GetObjectCommand(downloadConfig);
		return await this.s3.send(getObjCmd)
			.then((res) => res.Body.transformToByteArray())
			.catch((e) => {
				return Promise.reject({message: `Could not get object: '${config.key}' in bucket: '${config.bucket}'`, error: e});
			});
	}

	async delete(config: ObjectConfig): Promise<Uint8Array> {
		const deleteConfig: DeleteObjectCommandInput = {
			Bucket: config.bucket,
			Key: config.key,
		}

		const bytes = this.download(config);

		const delObjCmd = new DeleteObjectCommand(deleteConfig);
		try {
			return await this.s3.send(delObjCmd)
				.then((res) => {
					if (res.$metadata.httpStatusCode != 204) {
						throw new Error(`Unexpected http statuscode '${res.$metadata.httpStatusCode}'. Expected 204.`);
					}
					return bytes;
				})
				.catch((e) => {
					return Promise.reject({message: `Could not delete object: '${config.key}' in bucket: '${config.bucket}'`, error: e});
				});
		} catch(e) {
			return Promise.reject({message: "Error deleting object: " + (e as Error).message, error: e});
		}
	}
}
