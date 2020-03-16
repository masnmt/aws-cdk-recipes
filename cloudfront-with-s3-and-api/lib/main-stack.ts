
import * as Core from '@aws-cdk/core'
import * as S3 from '@aws-cdk/aws-s3'
import * as S3Deployment from '@aws-cdk/aws-s3-deployment'
import * as ApiGateway from '@aws-cdk/aws-apigateway'
import * as CloudFront from '@aws-cdk/aws-cloudfront'

export class MainStack extends Core.Stack
{
    constructor(scope: Core.Construct, id: string, props?: Core.StackProps)
    {
        super(scope, id, { description: 'Main Stack', ...props })

        // S3
        const bucket = new S3.Bucket(this, `${this.stackName}S3`, {
            bucketName: '########',
            publicReadAccess: false
        })

        // API Gateway with Mock
        const api = new ApiGateway.RestApi(this, `${this.stackName}ApiGateway`, {
            restApiName: `${this.stackName}Api`,
            description: 'REST API',
            cloudWatchRole: false
        })
        api.root
            .addResource('api')
            .addResource('mock')
            .addResource('{id}')
            .addMethod('GET', new ApiGateway.MockIntegration({
                requestTemplates: {
                    'application/json': JSON.stringify({ statusCode: 200 })
                },
                integrationResponses: [{
                    statusCode: '200',
                    responseTemplates: {
                        'application/json': JSON.stringify({ message: 'OK' })
                    }
                }]
            }), { methodResponses: [{ statusCode: '200' }] })

        // OriginAccessIdentity
        const identity = new CloudFront.OriginAccessIdentity(this, `${this.stackName}Identity`, {
            comment: `${this.stackName} Identity`
        })

        // CloudFront
        const distribution = new CloudFront.CloudFrontWebDistribution(this, `${this.stackName}Distribution`, {
            comment: 'CloudFront: S3 and API Gateway',
            priceClass: CloudFront.PriceClass.PRICE_CLASS_200,
            originConfigs: [
                {
                    s3OriginSource: {  // change domain from regional domain
                        s3BucketSource: S3.Bucket.fromBucketAttributes(this, `${this.stackName}Bucket`, {
                            ...bucket,
                            bucketRegionalDomainName: bucket.bucketDomainName
                        }),
                        originAccessIdentity: identity
                    },
                    originPath: '/public_html',
                    behaviors : [{
                        isDefaultBehavior: true,
                    }]
                },
                {
                    customOriginSource: {
                        domainName: `${api.restApiId}.execute-api.${this.region}.amazonaws.com`
                    },
                    originPath: '/prod',
                    behaviors: [{
                        allowedMethods: CloudFront.CloudFrontAllowedMethods.ALL,
                        compress: false,
                        defaultTtl: Core.Duration.seconds(0),
                        forwardedValues: {
                            queryString: true,
                            cookies: { forward: 'all' },
                            headers: [ 'Accept', 'Origin', 'Authorization' ]
                        },
                        maxTtl: Core.Duration.seconds(0),
                        minTtl: Core.Duration.seconds(0),
                        pathPattern: 'api/*'
                    }]
                }
            ],
            errorConfigurations: [{
                errorCode: 403,
                errorCachingMinTtl: 300,
                responseCode: 404,
                responsePagePath: '/404.html'
            }]
        })

        new Core.CfnOutput(this, 'TopURL', { value: `https://${distribution.domainName}/` })

        //
        // If you have not iam::PassRole, comment out belows and do manually.
        //

        /* TODO: Apply Bucket Policy with CustomResource
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "1",
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity (Origin Access Id)"
                    },
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::(Bucket Name)/public_html/*"
                }
            ]
        }
        */
        /*
        bucket.addToResourcePolicy(new Iam.PolicyStatement({
            effect: Iam.Effect.ALLOW,
            actions: [ 's3:GetObject' ],
            principals: [ new Iam.CanonicalUserPrincipal(identity.cloudFrontOriginAccessIdentityS3CanonicalUserId) ],
            resources: [ `${bucketArn}/public_html/*` ]
        }))
        */

        // Upload html files when created S3 bucket
        new S3Deployment.BucketDeployment(this, `${this.stackName}S3Deployment`, {
            sources: [ S3Deployment.Source.asset('./html') ],
            destinationBucket: bucket,
            destinationKeyPrefix: 'public_html'
        })
    }
}
