# File-storing

### DISCLAIMER: This is a work in progress, and is not production ready.

### Changes
- upload function now also returns a succes bool, which can be used to check if upload was succesfull.
- better code completion for upload response.

A library for interacting with and creating AWS S3 buckets.

## Getting started

1. install package from npm

```bash
npm install file-storing
```

2. create an IAM user with full access to S3,

3. create an access key for the previously created user. Save the secret key in a secure place.

4. instantiate a new client:

```javascript
const client = new Client({
    region: "eu-central-1", // multiple regions available
    credentials: {
        accessKeyId: "KEYID",
        secretAccessKey: "SECRET_KEY",
    },
});
```

5. use the client to:

```javascript
client.createBucket(
    ...
);
client.deleteBucket(
    ...
);
client.upload(
    ...
);
client.download(
    ...
);
client.delete(
    ...
);
```
