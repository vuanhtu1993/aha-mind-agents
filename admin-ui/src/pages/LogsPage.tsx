import { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { FileText, CheckCircle2, XCircle, Loader2, RotateCw } from 'lucide-react';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<Record<string, any>>({});
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load logs function
  const fetchLogs = () => {
    setRefreshing(true);
    axios.get('/api/v1/dashboard/logs?limit=50')
      .then(res => {
        const items: any[] = res.data.items || [];
        const running: Record<string, any> = {};
        const finished: any[] = [];

        items.forEach((item: any) => {
          if (item.status === 'running') {
            running[item._id || item.jobId] = item;
          } else {
            finished.push(item);
          }
        });

        setActiveJobs(running);
        setLogs(finished);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  // Initial load
  useEffect(() => {
    fetchLogs();
  }, []);

  // Setup SSE
  useEffect(() => {
    // Listen SSE from dashboard controller
    const eventSource = new EventSource('/api/v1/dashboard/events');

    const parsePayload = (e: any) => {
      if (!e || !e.data) return null;
      try {
        return typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch (err) {
        console.error('Lỗi parse SSE event payload:', err, e.data);
        return null;
      }
    };

    eventSource.addEventListener('JOB_STARTED', (e: any) => {
      const payload = parsePayload(e);
      if (!payload || !payload.jobId) return;

      setActiveJobs(prev => {
        if (prev[payload.jobId]) return prev;
        return {
          ...prev,
          [payload.jobId]: {
            _id: payload.jobId,
            jobId: payload.jobId,
            status: 'running',
            pluginId: payload.pluginId,
            pipeline: payload.pipeline,
            createdAt: new Date(payload.timestamp || Date.now()).toISOString(),
            durationMs: 0,
            currentStep: 'Đang khởi tạo Agent...',
            steps: [],
            tokenUsage: null
          }
        };
      });
    });

    eventSource.addEventListener('JOB_STEP', (e: any) => {
      const payload = parsePayload(e);
      if (!payload || !payload.jobId) return;

      setActiveJobs(prev => {
        if (!prev[payload.jobId]) return prev;

        const currentJob = prev[payload.jobId];
        let stepText = 'Đang xử lý...';
        const eventData = payload.data;
        const updatedSteps = [...(currentJob.steps || [])];

        if (eventData) {
          const stepName = eventData.stepName || eventData.stepId;
          if (stepName) {
            if (eventData.status === 'completed') {
              const completedLabel = `Hoàn tất: ${stepName}`;
              if (!updatedSteps.includes(completedLabel)) {
                updatedSteps.push(completedLabel);
              }
              stepText = `Hoàn tất: ${stepName}`;
            } else {
              stepText = `Đang chạy: ${stepName}`;
            }
          } else if (eventData.message) {
            stepText = eventData.message;
          } else if (eventData.status === 'done') {
            stepText = 'Đang hoàn thiện kết quả...';
          }
        }

        return {
          ...prev,
          [payload.jobId]: {
            ...currentJob,
            steps: updatedSteps,
            currentStep: stepText,
          }
        };
      });
    });

    const handleJobEnd = (e: any) => {
      const payload = parsePayload(e);
      if (!payload || !payload.jobId) return;

      setActiveJobs(prev => {
        const newActive = { ...prev };
        const job = newActive[payload.jobId] || {
          _id: payload.jobId,
          jobId: payload.jobId,
          pluginId: payload.pluginId || payload.data?.pluginId || 'agent',
          pipeline: payload.pipeline || payload.data?.pipeline || 'pipeline',
          createdAt: new Date(payload.timestamp || Date.now()).toISOString(),
          steps: []
        };
        delete newActive[payload.jobId];

        const isFailed = payload.type === 'JOB_FAILED' || payload.data?.status === 'failed';
        const completedJob = {
          ...job,
          status: isFailed ? 'failed' : (payload.data?.status || 'completed'),
          error: isFailed ? (payload.data?.error || 'Execution failed') : undefined,
          tokenUsage: payload.data?.tokenUsage,
          durationMs: job.createdAt ? (Date.now() - new Date(job.createdAt).getTime()) : 0
        };
        setLogs(currentLogs => [completedJob, ...currentLogs.filter(l => (l._id || l.jobId) !== payload.jobId)]);
        return newActive;
      });
    };

    eventSource.addEventListener('JOB_COMPLETED', handleJobEnd);
    eventSource.addEventListener('JOB_FAILED', handleJobEnd);

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading logs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Execution Logs</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            disabled={refreshing}
            className="inline-flex items-center px-3.5 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            Refresh
          </button>
          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm font-medium">
            Real-time Updates
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Agent / Pipeline</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Tokens (Prompt/Completion)</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.values(activeJobs).map((job: any) => (
                <tr key={job._id || job.jobId} className="hover:bg-slate-50 transition-colors bg-blue-50/30">
                  <td className="px-6 py-4 whitespace-nowrap flex items-center">
                    <Loader2 className="w-5 h-5 text-blue-500 mr-2 animate-spin" />
                    <span className="font-medium capitalize text-blue-700">Running</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div>
                      {job.pluginId || job.agentId} <span className="text-slate-400 font-normal">/ {job.pipeline}</span>
                    </div>

                    {/* Danh sách các bước đã hoàn thành */}
                    {job.steps && job.steps.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {job.steps.map((completedStep: string, idx: number) => (
                          <div key={idx} className="flex items-center text-xs text-slate-600 font-normal">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mr-1.5 flex-shrink-0" />
                            <span>{completedStep}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bước hiện tại đang chạy */}
                    {job.currentStep && (
                      <div className="flex items-center text-xs text-blue-600 mt-1.5 font-medium animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 text-blue-500 mr-1.5 animate-spin flex-shrink-0" />
                        <span>{job.currentStep}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {format(new Date(job.createdAt || job.startedAt || Date.now()), 'MMM dd, HH:mm:ss')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                    --
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                    --
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button className="text-slate-400 font-medium cursor-not-allowed inline-flex items-center" disabled>
                      Processing...
                    </button>
                  </td>
                </tr>
              ))}

              {logs.map((log) => {
                const status = (log.status || '').toLowerCase();
                const isCompleted = status === 'completed';
                const isRunning = status === 'running';

                return (
                  <tr key={log._id || log.jobId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap flex items-center">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
                      ) : isRunning ? (
                        <Loader2 className="w-5 h-5 text-blue-500 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 mr-2" />
                      )}
                      <span className={`font-medium capitalize ${
                        isCompleted ? 'text-green-600' :
                        isRunning ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                      {log.pluginId || log.agentId} <span className="text-slate-400 font-normal">/ {log.pipeline}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {format(new Date(log.createdAt || log.startedAt || Date.now()), 'MMM dd, HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(2)}s` : '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-blue-600 font-medium">{log.tokenUsage?.promptTokens || 0}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="text-orange-500 font-medium">{log.tokenUsage?.completionTokens || 0}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedJob(log)}
                        className="text-primary hover:text-blue-700 font-medium transition-colors inline-flex items-center cursor-pointer"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && Object.keys(activeJobs).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No execution logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                Job Details: {selectedJob.pluginId} / {selectedJob.pipeline}
              </h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 mb-1">Job ID</p>
                  <p className="font-medium text-slate-800 break-all">{selectedJob._id || selectedJob.jobId}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Status</p>
                  <p className={`font-medium capitalize ${selectedJob.status === 'completed' ? 'text-green-600' : selectedJob.status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
                    {selectedJob.status}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Date</p>
                  <p className="font-medium text-slate-800">
                    {format(new Date(selectedJob.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Total Duration</p>
                  <p className="font-medium text-slate-800">
                    {(selectedJob.durationMs / 1000).toFixed(2)}s
                  </p>
                </div>
              </div>

              {selectedJob.error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm border border-red-100">
                  <p className="font-bold mb-1">Error Message:</p>
                  <p className="font-mono">{typeof selectedJob.error === 'string' ? selectedJob.error : JSON.stringify(selectedJob.error)}</p>
                </div>
              )}

              {selectedJob.timeline && selectedJob.timeline.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Execution Timeline</h4>
                  <div className="space-y-3">
                    {selectedJob.timeline.map((step: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center">
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 mr-2" />
                          )}
                          <span className="font-medium text-slate-700 text-sm">{step.nodeName}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-500 bg-white px-2 py-1 rounded shadow-sm">
                          {step.durationMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedJob.tokenUsage && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Token Usage</h4>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex gap-6 text-sm">
                    <div>
                      <p className="text-slate-500">Prompt</p>
                      <p className="font-bold text-blue-600 text-lg">{selectedJob.tokenUsage.promptTokens}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Completion</p>
                      <p className="font-bold text-orange-500 text-lg">{selectedJob.tokenUsage.completionTokens}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Total</p>
                      <p className="font-bold text-slate-800 text-lg">{selectedJob.tokenUsage.totalTokens}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
