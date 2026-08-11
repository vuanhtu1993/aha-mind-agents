import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Save, Bot, Activity, Settings2, Info } from 'lucide-react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Editor from '@monaco-editor/react';
import AgentGraphNode from '../components/AgentGraphNode';

const nodeTypes = { custom: AgentGraphNode };

export default function ConfigsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  
  const [config, setConfig] = useState<any>({ nodeOverrides: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Fetch plugins
  useEffect(() => {
    axios.get('/api/v1/dashboard/plugins')
      .then(res => {
        setPlugins(res.data);
        if (res.data.length > 0) {
          setSelectedAgentId(res.data[0].id);
          if (res.data[0].metadata?.pipelines?.length > 0) {
            setSelectedPipelineId(res.data[0].metadata.pipelines[0].id);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch config for selected agent
  useEffect(() => {
    if (!selectedAgentId) return;
    axios.get(`/api/v1/dashboard/configs/${selectedAgentId}`)
      .then(res => {
        setConfig({ ...res.data, nodeOverrides: res.data.nodeOverrides || {} });
        setMessage('');
      })
      .catch(console.error);
  }, [selectedAgentId]);

  // Map Pipeline Data to React Flow
  useEffect(() => {
    if (!selectedAgentId || !selectedPipelineId || plugins.length === 0) return;
    const plugin = plugins.find(p => p.id === selectedAgentId);
    if (!plugin) return;
    const pipeline = plugin.metadata?.pipelines?.find((p: any) => p.id === selectedPipelineId);
    if (!pipeline) return;

    // Reset selection when switching pipelines
    setSelectedNodeId(null);

    // Calculate basic Top-Down Layout
    const initialNodes = pipeline.nodes?.map((n: any, idx: number) => ({
      id: n.id,
      type: 'custom',
      position: { x: 250, y: 50 + idx * 150 }, // Simple vertical layout
      data: { ...n },
    })) || [];

    const initialEdges = pipeline.edges?.map((e: any, idx: number) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    })) || [];

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [selectedAgentId, selectedPipelineId, plugins]);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await axios.put(`/api/v1/dashboard/configs/${selectedAgentId}`, {
        nodeOverrides: config.nodeOverrides
      });
      setMessage('✅ Configuration saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('❌ Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const updateNodeConfig = (nodeId: string, field: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      nodeOverrides: {
        ...prev.nodeOverrides,
        [nodeId]: {
          ...prev.nodeOverrides[nodeId],
          [field]: value
        }
      }
    }));
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading configurations...</div>;

  const plugin = plugins.find(p => p.id === selectedAgentId);
  const pipeline = plugin?.metadata?.pipelines?.find((p: any) => p.id === selectedPipelineId);
  
  // Find selected node original metadata
  const selectedNodeMeta = pipeline?.nodes?.find((n: any) => n.id === selectedNodeId);
  const isSelectedLLM = selectedNodeMeta?.type === 'llm';
  const currentNodeConfig = selectedNodeMeta ? (config.nodeOverrides[selectedNodeMeta.id] || {}) : {};

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center">
            <Settings2 className="w-6 h-6 mr-2 text-primary" /> Agent Configuration
          </h2>
          <p className="text-slate-500 mt-1 text-sm">Visualize pipeline graph and tune LLM prompts dynamically.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            className="bg-white border border-slate-200 rounded-lg px-4 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
            value={selectedAgentId}
            onChange={e => {
              setSelectedAgentId(e.target.value);
              const p = plugins.find(x => x.id === e.target.value);
              if (p?.metadata?.pipelines?.length > 0) setSelectedPipelineId(p.metadata.pipelines[0].id);
            }}
          >
            {plugins.map(p => (
              <option key={p.id} value={p.id}>{p.displayName || p.id}</option>
            ))}
          </select>
          {plugin?.metadata?.pipelines && (
            <select 
              className="bg-white border border-slate-200 rounded-lg px-4 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
              value={selectedPipelineId}
              onChange={e => setSelectedPipelineId(e.target.value)}
            >
              {plugin.metadata.pipelines.map((p: any) => (
                <option key={p.id} value={p.id}>Pipeline: {p.displayName || p.id}</option>
              ))}
            </select>
          )}
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg font-medium text-sm mb-4 shrink-0 ${message.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message}
        </div>
      )}
      
      {/* Split Pane */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* LEFT PANE: GRAPH */}
        <div className="flex-[3] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 shadow-sm flex items-center">
            <Activity className="w-4 h-4 mr-2 text-primary" />
            Execution Graph
          </div>
          <ReactFlow 
            nodes={nodes} 
            edges={edges} 
            onNodesChange={onNodesChange} 
            onEdgesChange={onEdgesChange} 
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-50/50"
          >
            <Background color="#cbd5e1" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* RIGHT PANE: CONFIGURATION */}
        <div className="flex-[2] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-800">Node Configuration</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedNodeId && (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <Bot className="w-8 h-8" />
                </div>
                <p>Select a node on the graph<br/>to edit its configuration.</p>
              </div>
            )}

            {selectedNodeId && selectedNodeMeta && (
              <div className="space-y-6">
                <div className="flex items-center">
                  <div className={`w-3 h-8 rounded-full mr-3 ${isSelectedLLM ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
                  <div>
                    <h4 className="text-xl font-bold text-slate-800">{selectedNodeMeta.displayName || selectedNodeMeta.id}</h4>
                    <p className="text-sm text-slate-500 font-medium">Node ID: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">{selectedNodeMeta.id}</code></p>
                  </div>
                </div>

                {!isSelectedLLM ? (
                  <div className="bg-orange-50 border border-orange-100 text-orange-700 p-4 rounded-lg flex items-start">
                    <Info className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
                    <p className="text-sm leading-relaxed">
                      This is a <strong>Tool Node</strong>. It performs deterministic operations (e.g. fetching API, converting files) and does not require LLM prompts or models to be configured.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div>
                      <label className="flex items-center justify-between text-sm font-bold text-slate-700 mb-2">
                        System Prompt
                        <span className="text-xs font-normal text-slate-400">Controls AI Behavior</span>
                      </label>
                      <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm h-[300px] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                        <Editor
                          height="100%"
                          defaultLanguage="markdown"
                          theme="light"
                          value={currentNodeConfig.systemPrompt || selectedNodeMeta.defaultConfig?.systemPrompt || ''}
                          onChange={(value) => updateNodeConfig(selectedNodeMeta.id, 'systemPrompt', value)}
                          options={{
                            minimap: { enabled: false },
                            wordWrap: 'on',
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            padding: { top: 12, bottom: 12 }
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Model</label>
                        <input 
                          type="text"
                          className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-700 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                          placeholder={selectedNodeMeta.defaultConfig?.model || 'Inherit Default'}
                          value={currentNodeConfig.model || ''}
                          onChange={(e) => updateNodeConfig(selectedNodeMeta.id, 'model', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Temperature</label>
                        <input 
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-700 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                          placeholder={selectedNodeMeta.defaultConfig?.temperature?.toString() || '0.1'}
                          value={currentNodeConfig.temperature ?? ''}
                          onChange={(e) => updateNodeConfig(selectedNodeMeta.id, 'temperature', parseFloat(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
