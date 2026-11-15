import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../state/auth-store.js";
import { createChatGroup, downloadChatAttachment, getChatConversations, getChatDirectory, getChatMessages, markChatRead, sendChatMessage, startDirectChat, uploadChatAttachment, type ChatAttachment, type ChatConversation, type ChatPerson } from "../../lib/chat-api.js";
import "./ChatPage.css";

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase();
const clock=(date?:string|null)=>date?new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(date)):"";
function titleOf(chat:ChatConversation,userId:string){return chat.kind==="GROUP"?(chat.title||"Untitled group"):(chat.participants.find((p)=>p.user.id!==userId)?.user.fullName||"Direct message");}

export function ChatPage(){
 const user=useAuthStore(s=>s.user), token=useAuthStore(s=>s.accessToken), qc=useQueryClient();
 const [activeId,setActiveId]=useState(""),[draft,setDraft]=useState(""),[search,setSearch]=useState(""),[showNew,setShowNew]=useState(false),[groupMode,setGroupMode]=useState(false),[groupName,setGroupName]=useState(""),[selected,setSelected]=useState<string[]>([]),[allUsers,setAllUsers]=useState(false);
 const chatsQ=useQuery({queryKey:["chat-conversations"],queryFn:getChatConversations,enabled:!!token,refetchInterval:8000});
 const chats=chatsQ.data?.data??[];
 const active=chats.find(c=>c.id===activeId)??null;
 useEffect(()=>{if(!activeId&&chats[0])setActiveId(chats[0].id);else if(activeId&&!chats.some(c=>c.id===activeId))setActiveId(chats[0]?.id??"");},[chats,activeId]);
 const messagesQ=useQuery({queryKey:["chat-messages",activeId],queryFn:()=>getChatMessages(activeId),enabled:!!token&&!!activeId,refetchInterval:2500});
 const messages=messagesQ.data?.data??[];
 useEffect(()=>{if(activeId&&messages.length)void markChatRead(activeId).then(()=>qc.invalidateQueries({queryKey:["chat-conversations"]})).catch(()=>undefined);},[activeId,messages.at(-1)?.id,qc]);
 const directoryQ=useQuery({queryKey:["chat-directory",search],queryFn:()=>getChatDirectory(search),enabled:!!token&&showNew});
 const directory=directoryQ.data?.data??[];
 const send=useMutation({mutationFn:(input:{body:string;attachmentIds:string[]})=>sendChatMessage(activeId,input.body,input.attachmentIds),onSuccess:async()=>{setDraft("");setPendingFiles([]);await Promise.all([qc.invalidateQueries({queryKey:["chat-messages",activeId]}),qc.invalidateQueries({queryKey:["chat-conversations"]})]);}});
 const direct=useMutation({mutationFn:(person:ChatPerson)=>startDirectChat(person.id),onSuccess:async(r)=>{setActiveId(r.data.id);setShowNew(false);setSearch("");await qc.invalidateQueries({queryKey:["chat-conversations"]});}});
 const group=useMutation({mutationFn:()=>createChatGroup({title:groupName,participantIds:selected,includeAllEligible:allUsers,confirmLargeGroup:selected.length>50}),onSuccess:async(r)=>{setActiveId(r.data.id);setShowNew(false);setGroupMode(false);setGroupName("");setSelected([]);setAllUsers(false);await qc.invalidateQueries({queryKey:["chat-conversations"]});}});
 const unread=useMemo(()=>chats.reduce((n,c)=>n+c.unreadCount,0),[chats]);
 function submit(e:FormEvent){e.preventDefault();if((draft.trim()||pendingFiles.length)&&activeId&&!send.isPending)send.mutate({body:draft.trim(),attachmentIds:pendingFiles.map(file=>file.id)});}
 async function handleFile(file:File){if(!activeId)return;setUploading(true);setUploadError("");try{const result=await uploadChatAttachment(activeId,file);setPendingFiles(current=>[...current,result.data]);}catch(error){setUploadError(error instanceof Error?error.message:"File upload failed");}finally{setUploading(false);}}
 return <main className="chat-page">
  <header className="chat-heading"><div><span className="chat-kicker">LAUNDRYANGEL WORKSPACE</span><h1>Team Chat</h1><p>Keep your team connected across daily operations.</p></div><button className="chat-primary" onClick={()=>setShowNew(true)}>＋ New conversation</button></header>
  <section className="chat-layout">
   <aside className="chat-list-panel"><div className="chat-list-title"><div><strong>Messages</strong><small>{unread?unread+" unread":"Your conversations"}</small></div><button onClick={()=>setShowNew(true)} aria-label="New chat">＋</button></div>
    <label className="chat-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations"/></label>
    <div className="chat-list-scroll">{chatsQ.isLoading?<p className="chat-hint">Loading conversations…</p>:null}{chatsQ.isError?<button className="chat-error" onClick={()=>void chatsQ.refetch()}>Could not load chats. Retry</button>:null}
     {!chatsQ.isLoading&&!chats.length?<div className="chat-blank"><span>✦</span><b>No conversations yet</b><p>Start a private chat or create a group for your team.</p></div>:null}
     {chats.filter(c=>titleOf(c,user?.id??"").toLowerCase().includes(search.toLowerCase())).map(c=><button key={c.id} onClick={()=>setActiveId(c.id)} className={"chat-row "+(activeId===c.id?"is-active":"")}><span className="chat-avatar">{initials(titleOf(c,user?.id??""))}</span><span className="chat-row-copy"><b>{titleOf(c,user?.id??"")}</b><small>{c.lastMessage?.body??(c.kind==="GROUP"?"Group conversation":"Start a conversation")}</small></span><span className="chat-row-meta"><small>{clock(c.lastMessage?.createdAt??c.lastMessageAt)}</small>{c.unreadCount>0?<b>{c.unreadCount>99?"99+":c.unreadCount}</b>:null}</span></button>)}
    </div>
   </aside>
   <section className="chat-thread">
    {active?<><header className="chat-thread-head"><span className="chat-avatar big">{initials(titleOf(active,user?.id??""))}</span><div><b>{titleOf(active,user?.id??"")}</b><small>{active.kind==="GROUP"?active.participants.length+" participants":"Direct conversation"}</small></div><span className="chat-private">● Private to participants</span></header>
     <div className="chat-messages">{messagesQ.isLoading?<p className="chat-hint">Loading messages…</p>:null}{messagesQ.isError?<button className="chat-error" onClick={()=>void messagesQ.refetch()}>Messages unavailable. Retry</button>:null}
      {messages.map(m=><article key={m.id} className={"chat-bubble "+(m.kind==="SYSTEM"?"chat-system":m.sender.id===user?.id?"chat-mine":"")}>{m.kind==="SYSTEM"?m.body:<><div className="chat-bubble-meta"><b>{m.sender.id===user?.id?"You":m.sender.fullName}</b><time>{clock(m.createdAt)}</time></div>{m.replyTo?<blockquote>{m.replyTo.sender.fullName}: {m.replyTo.body}</blockquote>:null}{m.body?<p>{m.body}</p>:null}{m.attachments?.length?<div className="chat-attachments">{m.attachments.map(file=><button type="button" key={file.id} onClick={()=>void downloadChatAttachment(file.id,file.originalName)}><span>↧</span><span><b>{file.originalName}</b><small>{Math.max(1,Math.round(file.sizeBytes/1024))} KB · Download</small></span></button>)}</div>:null}{m.reactions?.length?<div className="chat-reaction-list">{m.reactions.map(r=><span key={r.id}>{r.emoji}</span>)}</div>:null}</>}</article>)}
      {!messagesQ.isLoading&&!messages.length?<div className="chat-blank chat-first"><span>✧</span><b>This is the beginning</b><p>Send a message to get the conversation started.</p></div>:null}
     </div>
     <form className="chat-compose" onSubmit={submit}><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" rows={2} maxLength={5000}/>{pendingFiles.length?<div className="chat-pending-files">{pendingFiles.map(file=><span key={file.id}>📎 {file.originalName}</span>)}</div>:null}<div><label className="chat-file-picker">＋ Attach<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx,.pptx" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void handleFile(file);e.currentTarget.value="";}}/></label><small>{uploadError|| (uploading?"Uploading attachment…":send.isError?"Message could not be sent. Please retry.":"Files up to 10 MB · Enter to write")}</small><button disabled={(!draft.trim()&&!pendingFiles.length)||send.isPending||uploading}>{send.isPending?"Sending…":"Send message  ➤"}</button></div></form>
    </>:<div className="chat-welcome"><span>✦</span><h2>Your team, in sync.</h2><p>Select a conversation or start a new one with an eligible colleague.</p><button className="chat-primary" onClick={()=>setShowNew(true)}>Start a conversation</button></div>}
   </section>
   <aside className="chat-info"><span className="chat-info-icon">✦</span><b>Better work, together.</b><p>Keep operational updates and team decisions close to the work.</p><div><span>Conversations</span><b>{chats.length}</b></div><div><span>Unread messages</span><b>{unread}</b></div></aside>
  </section>
  {showNew?<div className="chat-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowNew(false);}}><section className="chat-dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title"><header><div><span className="chat-kicker">NEW MESSAGE</span><h2 id="new-chat-title">{groupMode?"Create a group":"Start a conversation"}</h2></div><button aria-label="Close" onClick={()=>setShowNew(false)}>×</button></header><nav><button className={!groupMode?"chosen":""} onClick={()=>setGroupMode(false)}>Direct message</button><button className={groupMode?"chosen":""} onClick={()=>setGroupMode(true)}>Group chat</button></nav>
   {groupMode?<><label className="chat-group-name">Group name<input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="e.g. Wuse Branch Team" maxLength={80}/></label><label className="chat-all"><input type="checkbox" checked={allUsers} onChange={e=>setAllUsers(e.target.checked)}/> Include all eligible colleagues in my branch</label></>:<label className="chat-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a colleague by name or email"/></label>}
   <div className="chat-directory">{directoryQ.isLoading?<p className="chat-hint">Finding colleagues…</p>:null}{directory.map(person=><button key={person.id} onClick={()=>groupMode?setSelected(old=>old.includes(person.id)?old.filter(id=>id!==person.id):[...old,person.id]):direct.mutate(person)}><span className="chat-avatar">{initials(person.fullName)}</span><span><b>{person.fullName}</b><small>{person.role??person.email}</small></span>{groupMode?<input type="checkbox" checked={selected.includes(person.id)} readOnly/>:<em>Message →</em>}</button>)}</div>
   {groupMode?<button className="chat-primary chat-create" disabled={!groupName.trim()||(!allUsers&&selected.length<2)||group.isPending} onClick={()=>group.mutate()}>{group.isPending?"Creating…":`Create group · ${allUsers?"all eligible":selected.length+" selected"}`}</button>:null}
   {direct.isError||group.isError?<p className="chat-error">Could not start this conversation. Check permissions and try again.</p>:null}
  </section></div>:null}
 </main>;
}
