import { Handle, Position } from '@xyflow/react';
import { Cpu, Wrench } from 'lucide-react';

export default function AgentGraphNode({ data, selected }: any) {
  const isLLM = data.type === 'llm';
  const Icon = isLLM ? Cpu : Wrench;
  const currentModel = data.configuredModel || data.defaultConfig?.model;
  const driftStatus = data.driftStatus; // 'synced' | 'modified' | 'new'

  return (
    <div
      className={`px-4 py-3 shadow-lg rounded-xl border-2 bg-white flex items-center min-w-[240px] max-w-[300px] transition-all ${
        selected
          ? isLLM
            ? 'border-blue-600 ring-4 ring-blue-500/20 scale-105'
            : 'border-orange-500 ring-4 ring-orange-500/20 scale-105'
          : isLLM
          ? 'border-blue-200 hover:border-blue-300'
          : 'border-orange-200 hover:border-orange-300'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 shadow-sm shrink-0 ${
          isLLM ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="overflow-hidden flex-1">
        <div className="flex items-center justify-between gap-1">
          <h4 className="font-bold text-slate-800 text-sm truncate" title={data.displayName || data.id}>
            {data.displayName || data.id}
          </h4>
          {driftStatus === 'modified' && (
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Đã tùy biến so với code" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              isLLM ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}
          >
            {isLLM ? 'LLM' : 'Tool'}
          </span>
          {isLLM && currentModel && (
            <span
              className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[120px]"
              title={currentModel}
            >
              {currentModel.split('/').pop()}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
    </div>
  );
}
