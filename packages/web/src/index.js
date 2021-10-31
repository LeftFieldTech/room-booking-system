import React from 'react'
import ReactDOM from 'react-dom'
import './css/index.css'
import App from './App'
import registerServiceWorker from './registerServiceWorker'
import Amplify from 'aws-amplify';
import API from '@aws-amplify/api';
import Auth from '@aws-amplify/auth';

import awsconfig from './aws-exports';
import { setToken } from './api/init'
import { getSessionToken } from './api/auth'
Amplify.configure(awsconfig);


getSessionToken().then((token) => {
    ReactDOM.render(<App />, document.getElementById('root'))
    setToken(token)
    registerServiceWorker()
})
