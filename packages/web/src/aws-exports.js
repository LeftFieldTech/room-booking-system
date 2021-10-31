import { Auth } from 'aws-amplify'

const config = {
  aws_project_region: process.env.REACT_APP_AWS_REGION || '',
  aws_cognito_region: process.env.REACT_APP_AWS_REGION || '',
  aws_user_pools_id: process.env.REACT_APP_USERPOOL_ID || '',
  aws_user_pools_web_client_id: process.env.REACT_APP_USERPOOL_CLIENT_ID || '',
  aws_cognito_identity_pool_id: process.env.REACT_APP_IDENTITYPOOL_ID,
  aws_cloud_logic_custom: [
    {
        "name": "demoAPI",
        "endpoint": process.env.REACT_APP_API_URL,
        custom_header: async () => { 
          return { Authorization: `Bearer ${(await Auth.currentSession()).getIdToken().getJwtToken()}` }
        }

    },
  ],
};
  
export default config;
  