import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createGroupSchema, createEventSchema, eventListQuerySchema, eventMessageSchema } from "@sp/validation";
import type { CommunityStore } from "./store";
import { CommunityError } from "./store";
type Guard=(req:FastifyRequest,reply:FastifyReply)=>Promise<unknown>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function registerCommunity(app:FastifyInstance,deps:{store:CommunityStore;requireAuth:Guard}) {
 const pre={preHandler:deps.requireAuth};
 const wrap=(fn:(req:any,reply:FastifyReply,me:string)=>Promise<unknown>)=>async(req:any,reply:FastifyReply)=>{try{return await fn(req,reply,req.auth.user.id);}catch(e){if(e instanceof CommunityError)return reply.code(e.code==="not_found"?404:e.code==="forbidden"?403:e.code==="full"?409:400).send({error:e.code,message:e.message});throw e;}};
 app.get("/groups",pre,wrap(async(_req,reply,me)=>reply.send({groups:await deps.store.listGroups(me)})));
 app.post<{Body:unknown}>("/groups",pre,wrap(async(req,reply,me)=>{const p=createGroupSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:"validation"});return reply.code(201).send({group:await deps.store.createGroup(me,p.data)});}));
 app.get<{Params:{id:string}}>("/groups/:id",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});return reply.send({group:await deps.store.getGroup(me,req.params.id)});}));
 app.post<{Params:{id:string}}>("/groups/:id/join",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});await deps.store.joinGroup(me,req.params.id);return reply.code(204).send();}));
 app.delete<{Params:{id:string}}>("/groups/:id/join",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});await deps.store.leaveGroup(me,req.params.id);return reply.code(204).send();}));
 app.get("/activities",pre,wrap(async(_req,reply)=>reply.send({activities:await deps.store.listActivities()})));
 app.post<{Body:unknown}>("/events",pre,wrap(async(req,reply,me)=>{const p=createEventSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:"validation"});return reply.code(201).send({event:await deps.store.createEvent(me,p.data)});}));
 app.get<{Querystring:unknown}>("/events",pre,wrap(async(req,reply,me)=>{const p=eventListQuerySchema.safeParse(req.query);if(!p.success)return reply.code(400).send({error:"validation"});return reply.send({events:await deps.store.listEvents(me,p.data.generalArea)});}));
 app.get<{Params:{id:string}}>("/events/:id",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});return reply.send({event:await deps.store.getEvent(me,req.params.id)});}));
 app.post<{Params:{id:string}}>("/events/:id/rsvp",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});return reply.send(await deps.store.rsvp(me,req.params.id));}));
 app.delete<{Params:{id:string}}>("/events/:id/rsvp",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});await deps.store.cancelRsvp(me,req.params.id);return reply.code(204).send();}));
 app.get<{Params:{id:string}}>("/events/:id/messages",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});return reply.send({messages:await deps.store.listEventMessages(me,req.params.id)});}));
 app.post<{Params:{id:string};Body:unknown}>("/events/:id/messages",pre,wrap(async(req,reply,me)=>{if(!UUID.test(req.params.id))return reply.code(400).send({error:"bad_request"});const p=eventMessageSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:"validation"});return reply.code(201).send({message:await deps.store.sendEventMessage(me,req.params.id,p.data.body,p.data.clientTag)});}));
}
