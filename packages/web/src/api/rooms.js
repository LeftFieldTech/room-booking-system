import { API } from 'aws-amplify';

export async function listRooms() {
  return API.get('demoAPI','/rooms')
}
