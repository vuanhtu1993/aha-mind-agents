import { Handle, Position } from '@xyflow/react';
import { Cpu, Wrench } from 'lucide-react';

export default function AgentGraphNode({ data, selected }: any) {
  const isLLM = data.type === 'llm';
  const Icon = isLLM ? Cpu : Wrench;

  return (
    <div className={`px-4 py-3 shadow-lg rounded-xl border-2 bg-white flex items-center min-w-[220px] transition-all
      ${selected ? (isLLM ? 'border-primary ring-4 ring-primary/20 scale-105' : 'border-orange-500 ring-4 ring-orange-500/20 scale-105') : (isLLM ? 'border-blue-200' : 'border-orange-200')}
    `}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 shadow-sm ${isLLM ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-bold text-slate-800 text-sm">{data.displayName || data.id}</h4>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 inline-block ${isLLM ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
          {isLLM ? 'LLM Node' : 'Tool Node'}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
    </div>
  );
}
