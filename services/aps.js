/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by APS Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

const { SdkManagerBuilder } = require('@aps_sdk/autodesk-sdkmanager');
const { AuthenticationClient, Scopes } = require('@aps_sdk/authentication');
const { OssClient, CreateBucketsPayloadPolicyKeyEnum, CreateBucketXAdsRegionEnum } = require('@aps_sdk/oss');
const { ModelDerivativeClient, View, Type } = require('@aps_sdk/model-derivative');
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET } = require('../config.js');

const sdk = SdkManagerBuilder.create().build();
const authenticationClient = new AuthenticationClient(sdk);
const ossClient = new OssClient(sdk);
const modelDerivativeClient = new ModelDerivativeClient(sdk);

const service = module.exports = {};

service.getInternalToken = async () => {
    const credentials = await authenticationClient.getTwoLeggedToken(APS_CLIENT_ID, APS_CLIENT_SECRET, [
        Scopes.DataRead,
        Scopes.DataCreate,
        Scopes.DataWrite,
        Scopes.BucketCreate,
        Scopes.BucketRead
    ]);
    return credentials;
};

service.getPublicToken = async () => {
    const credentials = await authenticationClient.getTwoLeggedToken(APS_CLIENT_ID, APS_CLIENT_SECRET, [
        Scopes.DataRead
    ]);
    return credentials;
};

service.ensureBucketExists = async (bucketKey) => {
    const { access_token } = await service.getInternalToken();
    try {
        await ossClient.getBucketDetails(access_token, bucketKey);
    } catch (err) {
        if (err.axiosError.response.status === 404) {
            await ossClient.createBucket(access_token, CreateBucketXAdsRegionEnum.Us, {
                bucketKey: bucketKey,
                policyKey: CreateBucketsPayloadPolicyKeyEnum.Temporary
            });
        } else {
            throw err;  
        }
    }
};

service.listObjects = async (bucket) => {
    const { access_token } = await service.getInternalToken();
    let resp = await ossClient.getObjects(access_token, bucket, { limit: 64 });
    let objects = resp.items;
    return objects;
};

service.listBuckets = async () => {
    const { access_token } = await service.getInternalToken();
    let resp = await ossClient.getBuckets(access_token);
    let buckets = resp.items;
    return buckets;
};

service.uploadObject = async (objectName, filePath, bucket) => {
    await service.ensureBucketExists(bucket);
    const { access_token } = await service.getInternalToken();
    const obj = await ossClient.upload(bucket, objectName, filePath, access_token);
    return obj;
};

service.translateObject = async (urn, rootFilename) => {
    const { access_token } = await service.getInternalToken();
    const job = await modelDerivativeClient.startJob(access_token, {
        input: {
            urn,
            compressedUrn: !!rootFilename,
            rootFilename
        },
        output: {
            formats: [{
                views: [View._2d, View._3d],
                type: Type.Svf
            }]
        }
    });
    return job.result;
};

service.getManifest = async (urn) => {
    const { access_token } = await service.getInternalToken();
    try {
        const manifest = await modelDerivativeClient.getManifest(access_token, urn);
        return manifest;
    } catch (err) {
        if (err.axiosError.response.status === 404) {
            return null;
        } else {
            throw err;
        }
    }
};

service.urnify = (id) => Buffer.from(id).toString('base64').replace(/=/g, '');