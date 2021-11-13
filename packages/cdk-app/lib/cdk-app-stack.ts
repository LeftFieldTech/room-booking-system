#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");

import * as cdk from '@aws-cdk/core';
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as lambda from '@aws-cdk/aws-lambda'
import * as amplify from '@aws-cdk/aws-amplify';
import * as cognito from '@aws-cdk/aws-cognito';
import * as iam from '@aws-cdk/aws-iam'
import { BlockPublicAccess, Bucket, BucketEncryption } from '@aws-cdk/aws-s3';


const getEnv = (env: string) => {
  const idx = ['qa', 'master'].indexOf(env) + 1;
  return {
    branchName: ['integration', 'qa', 'master'][idx],
    stage: ['DEVELOPMENT', 'PRODUCTION', 'PRODUCTION'][idx],
    // domainName: ['ecdev.xyz', 'ectst.xyz', 'companion.endurica.com'][idx],
    // domainName: [['ecdev.xyz'], ['ectst.xyz'], ['ecprod.xyz', 'companion.endurica.com']][idx],
  };
};


export class CdkAppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const env: string = String(process.env.ENV);
    const { branchName, stage } = getEnv(env);
    const demoFunction = new lambda.Function(this, 'demoFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('../api'),
      handler: 'lambda.handler',
      memorySize: 1024,
      environment: {
        JWT_SECRET: 'lf-dev',
        JWT_EXPIRES_IN: '30d',
        JWT_ALGORITHM: 'HS256',
        MONGO_URI:  cdk.SecretValue.secretsManager('LifeLeft', {
          jsonField: 'MONGO_URI',
        }).toString(),
      },
    });

    const bucketName: string = `rbook-${env}-builds`;
    const builds = new Bucket(this, bucketName, {
      versioned: false,
      bucketName: bucketName,
      encryption: BucketEncryption.UNENCRYPTED,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPool = new cognito.UserPool(this, 'rbook-userpool', {
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
    });
    
    const userPoolClient = new cognito.UserPoolClient(
      this,
      'rbook-userpool-client',
      {
        userPool
      }
    );
    const identityPool = new cognito.CfnIdentityPool(this, 'identity-pool', {
      identityPoolName: 'my-identity-pool',
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    const isAnonymousCognitoGroupRole = new iam.Role(
      this,
      'anonymous-group-role',
      {
        description: 'Default role for anonymous users',
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'unauthenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
          ),
        ],
      },
    );
  
  const isUserCognitoGroupRole = new iam.Role(this, 'users-group-role', {
    description: 'Default role for authenticated users',
    assumedBy: new iam.FederatedPrincipal(
      'cognito-identity.amazonaws.com',
      {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': identityPool.ref,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'authenticated',
        },
      },
      'sts:AssumeRoleWithWebIdentity',
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicExecutionRole',
      ),
    ],
  });
  new cognito.CfnIdentityPoolRoleAttachment(
    this,
    'identity-pool-role-attachment',
    {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: isUserCognitoGroupRole.roleArn,
        unauthenticated: isAnonymousCognitoGroupRole.roleArn,
      },
      roleMappings: {
        mapping: {
          type: 'Token',
          ambiguousRoleResolution: 'AuthenticatedRole',
          identityProvider: `cognito-idp.${
            cdk.Stack.of(this).region
          }.amazonaws.com/${userPool.userPoolId}:${
            userPoolClient.userPoolClientId
          }`,
        },
      },
    },
  );
    
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
        cognitoUserPools: [userPool],
        identitySource: 'method.request.header.Authorization'
    });

    const api = new apigateway.LambdaRestApi(this, 'demoAPI', {
        handler: demoFunction,
        defaultCorsPreflightOptions: {
          allowOrigins: apigateway.Cors.ALL_ORIGINS
        },
        defaultMethodOptions: {
          authorizationType: apigateway.AuthorizationType.COGNITO,
          authorizer
        }
    });

    const amplifyApp = new amplify.App(this, 'room-booking-system', {
      environmentVariables: {
        REACT_APP_API_URL: '/api',
        REACT_APP_AWS_REGION: process.env.CDK_DEFAULT_REGION || '',
        REACT_APP_IDENTITYPOOL_ID: identityPool.ref,
        REACT_APP_USERPOOL_ID: userPool.userPoolId,
        REACT_APP_USERPOOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    amplifyApp.addCustomRule({
      source: '/api/<*>',
      target: `${api.url}<*>`,
      status: amplify.RedirectStatus.REWRITE,
      
    });
    amplifyApp.addCustomRule(amplify.CustomRule.SINGLE_PAGE_APPLICATION_REDIRECT);
    amplifyApp.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)
    const branch = amplifyApp.addBranch(branchName, {
      branchName: branchName,
      autoBuild: true,
      pullRequestPreview: false,
      stage: stage,
    });
  }
}
