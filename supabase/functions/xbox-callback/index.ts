import {callbackResponse} from '../_shared/xbox.mjs';
// This public relay never creates a connection. xbox-link requires a user JWT,
// one-use state and a separate browser proof before redeeming the code.
Deno.serve(callbackResponse);
