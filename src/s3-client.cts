import { Upload } from "@aws-sdk/lib-storage";
import { AbortMultipartUploadCommandOutput, BucketLocationConstraint, CompleteMultipartUploadCommandOutput, CreateBucketCommand, CreateBucketCommandInput, CreateBucketCommandOutput, DeleteBucketCommand, DeleteBucketCommandInput, DeleteBucketCommandOutput, DeleteObjectCommand, DeleteObjectCommandInput, DeletePublicAccessBlockCommand, GetObjectCommand, GetObjectCommandInput, ObjectCannedACL, PutObjectAclCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";

export type ObjectBody = string | Uint8Array | Buffer | Readable;
export type ObjectAccess = ObjectCannedACL;

export type BucketRegion = BucketLocationConstraint;

export interface CreateBucketConfig {
	bucketName: string,
}

interface ObjectConfig {
	bucket: string,
	key: string,
}

export interface UploadConfig extends ObjectConfig {
	body: ObjectBody,
	objectAccess: ObjectAccess,
	serverSideEncryption?: "AES256" | "aws:kms" | "aws:kms:dsse",
}

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

	async createBucket(config: CreateBucketConfig): Promise<CreateBucketCommandOutput> {

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
			console.error(e);
			return Promise.reject("Could not create new bucket.");
		});

		const deletePABCmd = new DeletePublicAccessBlockCommand({Bucket: config.bucketName});
		return await this.s3.send(deletePABCmd)
		.then(() => res)
		.catch((e) => {
			console.error(e)
			return Promise.reject(`Could not delete public access block from bucket :'${config.bucketName}'`);
		});
	}

	async deleteBucket(bucket: string): Promise<DeleteBucketCommandOutput> {
		const cmd = new DeleteBucketCommand({Bucket: bucket});
		return this.s3.send(cmd);
	}

	async upload(config: UploadConfig): Promise<AbortMultipartUploadCommandOutput | CompleteMultipartUploadCommandOutput> {
		const uploadClient = new Upload({
			client: this.s3,
			params: {
				Bucket: config.bucket,
				Key: config.key,
				Body: config.body,
				ServerSideEncryption: config.serverSideEncryption || "AES256",
			},
		});

		uploadClient.on("httpUploadProgress", (progress) => {
			console.log(progress);
		});

		const res = await uploadClient.done();

		const putACLCmd = new PutObjectAclCommand({Bucket: config.bucket, Key: config.key, ACL: "public-read"});
		return await this.s3.send(putACLCmd)
		.then(() => res)
		.catch((e) => {
			console.error(e);
			return Promise.reject(`Could not put ACL for object: '${config.key}' in bucket: '${config.bucket}'`);
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
			console.error(e);
			return Promise.reject(`Could not get object: '${config.key}' in bucket: '${config.bucket}'`);
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
				if (res.$metadata.httpStatusCode != 204) throw new Error(`Unexpected http statuscode '${res.$metadata.httpStatusCode}'. Expected 204.`);
				return bytes;
			})
			.catch((e) => {
				console.error(e);
				return Promise.reject(`Could not delete object: '${config.key}' in bucket: '${config.bucket}'`);
			});
		} catch(e) {
			return Promise.reject("Error deleting object: " + (e as Error).message);
		}
	}
}
