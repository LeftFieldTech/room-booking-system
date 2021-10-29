#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");

import * as cdk from '@aws-cdk/core';
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as lambda from '@aws-cdk/aws-lambda'
import * as amplify from '@aws-cdk/aws-amplify';


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
      }
    });

    const api = new apigateway.LambdaRestApi(this, 'demoAPI', {
        handler: demoFunction,
        defaultCorsPreflightOptions: {
          allowOrigins: apigateway.Cors.ALL_ORIGINS
        }
    });

    const amplifyApp = new amplify.App(this, 'rbook', {
      environmentVariables: {
        REACT_APP_API_URL: api.url,
      },
    });
    amplifyApp.addCustomRule(amplify.CustomRule.SINGLE_PAGE_APPLICATION_REDIRECT);
    amplifyApp.addCustomRule({
      source: '/api',
      target: `${api.url}`,
      status: amplify.RedirectStatus.REWRITE
    });
    amplifyApp.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)
    const branch = amplifyApp.addBranch(branchName, {
      branchName: branchName,
      autoBuild: true,
      pullRequestPreview: false,
      stage: stage,
    });
  }
}
