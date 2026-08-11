import { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, Bot, Cpu } from 'lucide-react';

export default function ConfigsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [config, setConfig] = useState<any>({ nodeOverrides: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    axios.get('/api/v1/dashboard/plugins')
      .then(res => {
        setPlugins(res.data);
        if (res.data.length > 0) {
          setSelectedAgentId(res.data[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    axios.get(`/api/v1/dashboard/configs/${selectedAgentId}`)
      .then(res => {
        // Ensure nodeOverrides exists
        setConfig({ ...res.data, nodeOverrides: res.data.nodeOverrides || {} });
        setMessage('');
      })
      .catch(console.error);
  }, [selectedAgentId]);

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

  const selectedPlugin = plugins.find(p => p.id === selectedAgentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Agent Configuration</h2>
          <p className="text-slate-500 mt-1">Dynamically adjust node prompts and temperatures without redeploying.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <select 
            className="bg-white border border-slate-200 rounded-lg px-4 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
          >
            {plugins.map(p => (
              <option key={p.id} value={p.id}>{p.displayName || p.id}</option>
            ))}
          </select>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primaryDark text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg font-medium ${message.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message}
        </div>
      )}
      
      {selectedPlugin && (
        <div className="space-y-8">
          {selectedPlugin.pipelines?.map((pipeline: any) => (
            <div key={pipeline.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center">
                <Bot className="w-5 h-5 text-slate-600 mr-2" />
                <h3 className="text-lg font-semibold text-slate-800 capitalize">Pipeline: {pipeline.id}</h3>
              </div>
              <div className="p-6 space-y-8">
                {pipeline.nodes?.filter((n:any) => n.type === 'llm').map((node: any) => {
                  const nodeConfig = config.nodeOverrides[node.id] || {};
                  return (
                    <div key={node.id} className="border border-slate-100 rounded-lg p-5 bg-slate-50/50">
                      <div className="flex items-center mb-4">
                        <Cpu className="w-5 h-5 text-primary mr-2" />
                        <h4 className="font-semibold text-slate-800 text-lg">{node.displayName || node.id}</h4>
                        <span className="ml-3 text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-md uppercase tracking-wider font-semibold">LLM Node</span>
                      </div>
                      
                      <div className="space-y-4 ml-7">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">System Prompt</label>
                          <textarea 
                            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 min-h-[120px] font-mono leading-relaxed"
                            placeholder="You are a helpful assistant..."
                            value={nodeConfig.systemPrompt || node.defaultConfig?.systemPrompt || ''}
                            onChange={(e) => updateNodeConfig(node.id, 'systemPrompt', e.target.value)}
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
                            <input 
                              type="text"
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder={node.defaultConfig?.model || 'gemini-2.5-flash'}
                              value={nodeConfig.model || ''}
                              onChange={(e) => updateNodeConfig(node.id, 'model', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Temperature</label>
                            <input 
                              type="number"
                              step="0.1"
                              min="0"
                              max="2"
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder={node.defaultConfig?.temperature?.toString() || '0.1'}
                              value={nodeConfig.temperature ?? ''}
                              onChange={(e) => updateNodeConfig(node.id, 'temperature', parseFloat(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!pipeline.nodes || pipeline.nodes.filter((n:any) => n.type === 'llm').length === 0) && (
                  <div className="text-slate-500 italic">No configurable LLM nodes found in this pipeline.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
