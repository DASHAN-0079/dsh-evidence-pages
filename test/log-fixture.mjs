import { createMessage,createUserMessage,createToolResultMessage } from '@deepseek-ai/dsh-llm'
export const text = '准备🧪\n'.repeat(1400)+'FAIL CASE_8317\n'+'日志𠮷\n'.repeat(1500)
export function append(session,turn) {
  const id='tool-'+turn
  session.append('turn/start',{turn})
  session.append('user/message',createUserMessage({content:[{type:'text',text:'Please retain the exact failure.'}],source:{kind:'user'}}),{surfaceOp:'append'})
  session.append('step/start',{turn,step:1})
  session.append('assistant/message',{turn,step:1,stream:[],message:createMessage({role:'assistant',content:[{type:'tool-call',id,name:'tests',arguments:'{}'}],source:{kind:'model',model:'fixture',provider:'fixture'}})},{surfaceOp:'append'})
  session.append('tool/call',{turn,step:1,callId:id,name:'tests',arguments:'{}'})
  const seq=session.append('tool/result',{turn,step:1,message:createToolResultMessage({callId:id,isError:false,content:[{type:'text',text}]})},{surfaceOp:'append'}).seq
  session.append('step/end',{turn,step:1})
  session.append('turn/end',{turn,reason:{kind:'completed'}})
  return seq
}
