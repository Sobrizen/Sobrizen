import Stripe from 'npm:stripe@23.1.0';
import {CFG} from '../../../billing/core.mjs';
import {createBillingHandler} from '../../../billing/handler.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
const key=env('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:CFG.apiVersion,httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2,timeout:18000}):null;
Deno.serve(createBillingHandler({env,stripe}));
