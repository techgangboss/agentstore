import React, { useState, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, HelpCircle, Info, Sparkles, X, ChevronDown, Settings, AlertCircle } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';

const agentFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
  price: z.number().min(0),
  tags: z.array(z.string()).max(5),
  mcpEndpoint: z.string().url().optional().or(z.literal('')),
});

export type AgentFormData = z.infer<typeof agentFormSchema> & {
  type: 'open' | 'proprietary';
  pricingModel: 'free' | 'one_time';
  hasMcpEndpoint: boolean;
};

interface AgentFormProps {
  onSubmit: (data: AgentFormData) => Promise<void>;
  publisherId: string;
}

const SUGGESTED_TAGS = [
  'Productivity',
  'Development',
  'Research',
  'Automation',
  'AI/ML',
  'Data',
  'Security',
  'Trading',
  'Crypto',
  'Frontend',
  'Backend',
  'DevOps',
  'Utilities',
];

export function AgentForm({ onSubmit, publisherId }: AgentFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [shakeSubmit, setShakeSubmit] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitted },
  } = useForm<{
    name: string;
    description: string;
    price: number;
    mcpEndpoint: string;
  }>({
    defaultValues: {
      name: '',
      price: 0,
      description: '',
      mcpEndpoint: '',
    },
  });

  const triggerShake = useCallback(() => {
    setShakeSubmit(true);
    setTimeout(() => setShakeSubmit(false), 600);
  }, []);

  const rawPrice = watch('price');
  const price = typeof rawPrice === 'number' && !isNaN(rawPrice) ? rawPrice : 0;
  const name = watch('name');

  const handleFormSubmit = async (data: { name: string; description: string; price: number; mcpEndpoint: string }) => {
    setLoading(true);
    try {
      const safePrice = typeof data.price === 'number' && !isNaN(data.price) ? data.price : 0;
      const isFree = safePrice === 0;
      const hasMcp = !!data.mcpEndpoint;

      await onSubmit({
        name: data.name,
        description: data.description,
        price: safePrice,
        tags: selectedTags,
        type: isFree ? 'open' : 'proprietary',
        pricingModel: isFree ? 'free' : 'one_time',
        hasMcpEndpoint: hasMcp,
        mcpEndpoint: hasMcp ? data.mcpEndpoint : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const generateDescription = async () => {
    const currentName = getValues('name');
    if (!currentName || currentName.length < 2) return;

    setAiLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/ai/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentName }),
      });

      if (response.ok) {
        const { description } = await response.json();
        if (description) {
          setValue('description', description, { shouldValidate: true, shouldDirty: true });
        }
      }
    } catch (e) {
      console.error('AI description error:', e);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 5
        ? [...prev, tag]
        : prev
    );
  };

  const addCustomTag = () => {
    const tag = customTagInput.trim();
    if (tag && !selectedTags.includes(tag) && selectedTags.length < 5) {
      setSelectedTags((prev) => [...prev, tag]);
      setCustomTagInput('');
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomTag();
    }
  };

  const isFree = price === 0;

  return (
    <TooltipProvider>
      <form
        onSubmit={handleSubmit(handleFormSubmit, triggerShake)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="space-y-6"
      >
        {/* 1. Agent Name */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="name" className="text-white">
              Agent Name
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs bg-[#1a1a1a] border-white/10">
                <p>A clear, descriptive name for your agent.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="name"
            {...register('name', {
              required: 'Agent name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
            placeholder="e.g., Research Analyst, Code Reviewer"
            className={`bg-[#1a1a1a] text-white ${errors.name ? 'border-red-500 focus:border-red-500' : 'border-white/10'}`}
          />
          {errors.name && (
            <p className="text-sm text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.name.message}
            </p>
          )}
        </div>

        {/* 2. Description with AI autofill */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="description" className="text-white">
                Description
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-[#1a1a1a] border-white/10">
                  <p>Explain what your agent does. You can auto-generate a starting point from the name.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <button
              type="button"
              onClick={generateDescription}
              disabled={aiLoading || !name || name.length < 2}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Auto-generate
            </button>
          </div>
          <Textarea
            id="description"
            {...register('description', {
              required: 'Description is required',
              minLength: { value: 10, message: 'Description must be at least 10 characters' },
            })}
            placeholder="Describe what your agent does..."
            className={`bg-[#1a1a1a] text-white min-h-[100px] ${errors.description ? 'border-red-500 focus:border-red-500' : 'border-white/10'}`}
          />
          {errors.description && (
            <p className="text-sm text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {errors.description.message}
            </p>
          )}
        </div>

        {/* 3. Tags with custom input */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-white">Tags</Label>
            <span className="text-xs text-gray-500">({selectedTags.length}/5)</span>
          </div>

          {/* Selected tags */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium bg-teal-500/15 text-teal-400 border border-teal-500/20"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="hover:text-teal-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Custom tag input */}
          {selectedTags.length < 5 && (
            <div className="flex gap-2">
              <Input
                ref={tagInputRef}
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter"
                className="bg-[#1a1a1a] border-white/10 text-white text-sm flex-1"
              />
              <button
                type="button"
                onClick={addCustomTag}
                disabled={!customTagInput.trim()}
                className="px-3 py-1.5 text-sm font-medium bg-white/5 text-gray-400 rounded-md hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
              >
                Add
              </button>
            </div>
          )}

          {/* Suggested tags */}
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_TAGS.filter((t) => !selectedTags.includes(t)).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                disabled={selectedTags.length >= 5}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Price */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="price" className="text-white">
              Price
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs bg-[#1a1a1a] border-white/10">
                <p>Set to $0 for a free agent. Paid agents earn you 80% of each sale in USDC.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-40">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                {...register('price', {
                  valueAsNumber: true,
                  validate: (v) => {
                    if (typeof v === 'number' && !isNaN(v) && v < 0) return 'Price cannot be negative';
                    return true;
                  },
                })}
                className="bg-[#1a1a1a] border-white/10 text-white pl-7"
              />
            </div>
            <span className={`text-sm font-medium ${isFree ? 'text-teal-400' : 'text-gray-400'}`}>
              {isFree ? (
                'FREE'
              ) : (
                <>You earn: <span className="text-teal-400">${(price * 0.8).toFixed(2)}</span></>
              )}
            </span>
          </div>
        </div>

        {/* 5. Advanced Settings (MCP Endpoint) */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 w-full py-3 text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              Advanced Settings
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="mcpEndpoint" className="text-white text-sm">
                    MCP Endpoint
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-gray-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-[#1a1a1a] border-white/10">
                      <p>If your agent uses an MCP server for tools, provide the endpoint URL. Leave blank for simple prompt-based agents.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="mcpEndpoint"
                  {...register('mcpEndpoint')}
                  placeholder="https://your-mcp-server.com/mcp"
                  className="bg-[#1a1a1a] border-white/10 text-white text-sm"
                />
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <p>Optional. Simple agents without MCP tooling work great. You can add this later from your dashboard.</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Validation summary */}
        {isSubmitted && Object.keys(errors).length > 0 && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 font-medium">Please fix the errors above to continue</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${shakeSubmit ? 'animate-shake' : ''}`}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Agent'
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          Your agent will be published immediately after submission
        </p>
      </form>
    </TooltipProvider>
  );
}
