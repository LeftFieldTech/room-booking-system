import React from 'react';
import { AmplifyAuthenticator, AmplifySignUp, AmplifySignOut } from '@aws-amplify/ui-react';
import { Auth, Hub } from 'aws-amplify';

const withAuthenticator = (WrappedComponent) => {
    function App() {
        const [user, updateUser] = React.useState(null);
        React.useEffect(() => {
            Auth.currentAuthenticatedUser()
            .then(user => updateUser(user))
            .catch(() => console.log('No signed in user.'));
            Hub.listen('auth', data => {
                switch (data.payload.event) {
                    case 'signIn':
                    return updateUser(data.payload.data);
                    case 'signOut':
                    return updateUser(null);
                }
            });
        }, [])
        if (user) {
            return (
                <WrappedComponent/>
            )
        }
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <AmplifyAuthenticator usernameAlias="email">
                    <AmplifySignUp
                        usernameAlias='email'
                        slot="sign-up"
                        formFields={[
                            { type: "email" },
                            {
                                type: "password",
                            },
                        ]} 
                    />
                </AmplifyAuthenticator>
            </div>
        );
    }
    return App
}

export default withAuthenticator