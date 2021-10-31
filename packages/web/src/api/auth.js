import api, { setToken } from './init'
import { getDecodedToken } from './token'
import { Auth } from 'aws-amplify'

// Sends a POST request to /auth/sign-up on the server, with first name, last name, email & password registering the user and returning the JWT
export function signUp({ firstName, lastName, email, password }) {
  return api.post('/auth/sign-up', { firstName, lastName, email, password })
    .then(res => {
      const token = res.data.token
      setToken(token)
      return getDecodedToken()
    })
}

// Sends a POST request to /auth on the server, with the email & password returning the JWT
// Belonging to the user with supplied credentials
export function signIn({ email, password }) {
  return api.post('/auth', { email, password })
    .then(res => {
      const token = res.data.token
      setToken(token)
      return getDecodedToken()
    })
    .catch(res => {
      if (res.response.status === 400 || res.response.status === 401) {
        alert("There was an error with your email or password. Please try again.")
      }
    })
}

export function signOut() {
  setToken(null)
}


export async function getSessionToken() {
  try {
    const session = await Auth.currentSession()
    const token = session.getIdToken().getJwtToken()
    return token
  }catch(err) {
    console.log('err: ', err);
    return null
  }
}