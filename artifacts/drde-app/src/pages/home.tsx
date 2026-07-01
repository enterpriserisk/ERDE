import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Building2, DollarSign, Users, Award, Shield, 
  ShieldAlert, Laptop, Scale, HeartPulse, Megaphone,
  CheckCircle2, XCircle, Download, FileText, ArrowRight,
  RefreshCw, ChevronRight, Loader2
} from "lucide-react";
import { useStartAnalysis, useGetAnalysisStatus, useGetAnalysisReport, useRetryEmail, getGetAnalysisStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

const RISK_TOPICS = [
  { id: "Research", icon: Building2, label: "Research" },
  { id: "Funding", icon: DollarSign, label: "Funding" },
  { id: "Finance", icon: DollarSign, label: "Finance" },
  { id: "People", icon: Users, label: "People" },
  { id: "Athletics", icon: Award, label: "Athletics" },
  { id: "Security", icon: Shield, label: "Security" },
  { id: "Safety", icon: ShieldAlert, label: "Safety" },
  { id: "Digital", icon: Laptop, label: "Digital" },
  { id: "Regulatory", icon: Scale, label: "Regulatory" },
  { id: "Healthcare", icon: HeartPulse, label: "Healthcare" },
  { id: "Reputation", icon: Megaphone, label: "Reputation" },
];

const formSchema = z.object({
  topic: z.string().min(1, "Please select a risk topic"),
  recipientEmail: z.string().email("Please enter a valid email address"),
});

export default function Home() {
  const queryClient = useQueryClient();
  const [appState, setAppState] = useState<"IDLE" | "CONFIGURING" | "PROGRESS" | "COMPLETE">("IDLE");
  const [jobId, setJobId] = useState<number | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const startAnalysis = useStartAnalysis();
  const retryEmail = useRetryEmail();

  const { data: jobStatus } = useGetAnalysisStatus(jobId!, {
    query: {
      enabled: appState === "PROGRESS" && !!jobId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data?.status === "complete" || data?.status === "failed") return false;
        return 2000;
      },
      queryKey: getGetAnalysisStatusQueryKey(jobId!),
    }
  });

  const { data: reportData } = useGetAnalysisReport(jobId!, {
    query: {
      enabled: appState === "COMPLETE" && !!jobId && jobStatus?.status === "complete",
    }
  });

  React.useEffect(() => {
    if (jobStatus && (jobStatus.status === "complete" || jobStatus.status === "failed")) {
      setAppState("COMPLETE");
    }
  }, [jobStatus]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      recipientEmail: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    startAnalysis.mutate({ data: values }, {
      onSuccess: (data) => {
        setJobId(data.id);
        setAppState("PROGRESS");
      }
    });
  };

  const handleDownload = () => {
    if (!reportData?.reportContent) return;
    const element = document.createElement("a");
    const file = new Blob([reportData.reportContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `DRDE_Report_${reportData.topic}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col relative overflow-hidden text-foreground">
      {/* Background Accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-primary z-50"></div>
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 w-full max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {(appState === "IDLE" || appState === "CONFIGURING") && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center text-center max-w-3xl"
            >
              <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-secondary text-primary shadow-xl">
                <Shield className="w-10 h-10" />
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-secondary mb-4">
                Emerging Risk
                <br />
                Deep Evaluation
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground font-light mb-12 tracking-wide">
                DRDE Intelligence Briefing Tool
              </p>
              
              <Button 
                size="lg" 
                className="text-lg px-8 py-6 h-auto rounded-xl shadow-lg hover:shadow-xl transition-all"
                onClick={() => setAppState("CONFIGURING")}
                data-testid="button-configure"
              >
                Configure Briefing <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>
          )}

          {appState === "PROGRESS" && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl"
            >
              <Card className="border-none shadow-2xl overflow-hidden rounded-2xl">
                <div className="h-2 w-full bg-muted">
                  <motion.div 
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${jobStatus?.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-6">
                    <Loader2 className="w-8 h-8 text-secondary animate-spin" />
                  </div>
                  <h2 className="text-3xl font-semibold mb-2">Analyzing Intelligence</h2>
                  <p className="text-muted-foreground text-lg mb-8 h-8">
                    {jobStatus?.stage || "Initializing..."}
                  </p>
                  
                  <div className="w-full max-w-md bg-muted/50 rounded-lg p-4 text-sm font-mono text-muted-foreground text-left">
                    <div className="flex justify-between mb-2">
                      <span>Target:</span>
                      <span className="text-secondary font-medium">{jobStatus?.topic || form.getValues("topic")}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span>Recipient:</span>
                      <span className="text-secondary font-medium truncate ml-4">{jobStatus?.recipientEmail || form.getValues("recipientEmail")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Job ID:</span>
                      <span className="text-secondary font-medium">{jobId ? `DRDE-${jobId.toString().padStart(5, '0')}` : "Pending"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {appState === "COMPLETE" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl"
            >
              <Card className="border-none shadow-2xl rounded-2xl overflow-hidden">
                <div className={`h-3 w-full ${jobStatus?.status === 'failed' ? 'bg-destructive' : 'bg-primary'}`}></div>
                <CardHeader className="pt-10 pb-6 text-center">
                  <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-md"
                    style={{ backgroundColor: jobStatus?.status === 'failed' ? 'hsl(var(--destructive)/0.1)' : 'hsl(var(--primary)/0.2)' }}
                  >
                    {jobStatus?.status === 'failed' ? (
                      <XCircle className="w-10 h-10 text-destructive" />
                    ) : (
                      <span className="text-4xl">✅</span>
                    )}
                  </div>
                  <CardTitle className="text-3xl font-bold">
                    {jobStatus?.status === 'failed' ? 'Analysis Failed' : 'Analysis Complete'}
                  </CardTitle>
                  <CardDescription className="text-lg mt-2">
                    {jobStatus?.status === 'failed' 
                      ? 'The briefing could not be completed.'
                      : `Intelligence briefing for ${jobStatus?.topic} has been generated.`
                    }
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  <div className="bg-muted/30 rounded-xl p-6 border border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Status</p>
                        <p className="font-medium flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          Report Saved
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Delivery</p>
                        <div className="font-medium flex items-center gap-2">
                          {jobStatus?.emailSent === true ? (
                            <><CheckCircle2 className="w-4 h-4 text-green-600" /> Email Sent</>
                          ) : jobStatus?.emailSent === false ? (
                            <><XCircle className="w-4 h-4 text-destructive" /> Delivery Failed</>
                          ) : (
                            <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> Sending...</>
                          )}
                        </div>
                        {jobStatus?.emailError && (
                          <p className="text-xs text-destructive mt-1 line-clamp-2" title={jobStatus.emailError}>
                            {jobStatus.emailError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                
                <CardFooter className="bg-muted/10 flex flex-col sm:flex-row gap-3 pt-6 pb-8 px-8">
                  {jobStatus?.status === 'complete' && (
                    <>
                      <Button 
                        variant="default" 
                        className="w-full sm:w-auto flex-1 shadow-md hover:shadow-lg"
                        onClick={() => setIsReportOpen(true)}
                        data-testid="button-view-report"
                      >
                        <FileText className="w-4 h-4 mr-2" /> View Report
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="w-full sm:w-auto flex-1 shadow-sm hover:shadow-md"
                        onClick={handleDownload}
                        data-testid="button-download-report"
                      >
                        <Download className="w-4 h-4 mr-2" /> Download
                      </Button>
                    </>
                  )}
                  
                  {jobStatus?.emailSent === false && (
                    <Button 
                      variant="outline" 
                      className="w-full sm:w-auto"
                      onClick={() => {
                        if (jobId) retryEmail.mutate({ id: jobId });
                      }}
                      disabled={retryEmail.isPending}
                      data-testid="button-retry-email"
                    >
                      {retryEmail.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Retry Email
                    </Button>
                  )}
                  
                  <Button 
                    variant="ghost" 
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setAppState("IDLE");
                      setJobId(null);
                      form.reset();
                    }}
                    data-testid="button-start-new"
                  >
                    New Evaluation
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Configuration Modal */}
      <Dialog open={appState === "CONFIGURING"} onOpenChange={(open) => {
        if (!open) setAppState("IDLE");
      }}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
          <div className="h-2 w-full bg-secondary"></div>
          <DialogHeader className="px-8 pt-8 pb-4">
            <DialogTitle className="text-2xl font-bold text-secondary">Configure Briefing</DialogTitle>
            <DialogDescription className="text-base">
              Select an intelligence topic and define delivery parameters.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="px-8 pb-8 space-y-8">
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem className="space-y-4">
                    <FormLabel className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Risk Topic</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {RISK_TOPICS.map((topic) => {
                          const Icon = topic.icon;
                          const isSelected = field.value === topic.id;
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => field.onChange(topic.id)}
                              className={`
                                flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200
                                ${isSelected 
                                  ? 'border-primary bg-primary/5 text-secondary shadow-sm' 
                                  : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/50 hover:text-foreground'
                                }
                              `}
                              data-testid={`topic-${topic.id}`}
                            >
                              <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-primary' : ''}`} />
                              <span className="font-medium text-sm">{topic.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="recipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Delivery Email</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="executive@umich.edu" 
                        {...field} 
                        className="h-12 text-lg bg-muted/30 focus-visible:ring-primary focus-visible:border-primary"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="pt-4 flex justify-end gap-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setAppState("IDLE")}
                  className="px-6"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  size="lg"
                  disabled={startAnalysis.isPending || !form.formState.isValid}
                  className="px-8 shadow-md hover:shadow-lg"
                  data-testid="button-submit"
                >
                  {startAnalysis.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Initiating</>
                  ) : (
                    <>Deep Dive <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Report Viewer Modal */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col rounded-xl overflow-hidden border-none shadow-2xl">
          <div className="bg-secondary text-primary-foreground px-6 py-4 flex items-center justify-between shadow-sm z-10 relative">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Intelligence Briefing: {jobStatus?.topic}</h2>
              <p className="text-white/70 text-sm font-mono mt-1">ID: DRDE-{jobId?.toString().padStart(5, '0')} | {new Date().toLocaleDateString()}</p>
            </div>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
          
          <ScrollArea className="flex-1 bg-card p-8 md:p-12 prose max-w-none prose-slate dark:prose-invert">
            <div className="max-w-3xl mx-auto pb-12">
              {reportData?.reportContent ? (
                <div 
                  className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-card-foreground"
                >
                  {reportData.reportContent}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Loading report content...</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
