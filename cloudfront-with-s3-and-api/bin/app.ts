#!/usr/bin/env node

import 'source-map-support/register'
import { App } from '@aws-cdk/core'
import { MainStack } from '../lib/main-stack'

const app = new App()
const main = new MainStack(app, 'Main')
