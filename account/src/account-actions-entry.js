import {createClient} from '@supabase/supabase-js';
import {mountAccountActions} from './account-actions.js';
const sb=createClient('https://rgafawpucqdhjrzodayl.supabase.co','sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy');
mountAccountActions(sb,document);
