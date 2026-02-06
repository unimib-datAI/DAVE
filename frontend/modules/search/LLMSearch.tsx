import { SwitchEvent, Tooltip, Switch, Button } from '@nextui-org/react';
import { MessageSquareDashed, Code, X } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Popover, Button as AntButton } from 'antd';
import { ChatProvider } from '@/modules/chat/ChatProvider';
import { useAtom } from 'jotai';
import { persistedLLMSettingsAtom } from '@/atoms/llmSettings';
import { GlobalAnonymizationToggle } from '@/components/GlobalAnonymizationToggle';

type LLMSearchProps = {
  onClose: () => void;
};

const LLMSearch = forwardRef<HTMLDivElement, LLMSearchProps>(
  ({ onClose }, ref) => {
    const [devMode, setDevMode] = useState(false);
    const [settings] = useAtom(persistedLLMSettingsAtom);

    const handleModeChange = (ev: SwitchEvent) => {
      setDevMode(ev.target.checked);
    };

    return (
      <motion.div
        layout
        ref={ref}
        className={cn(
          'flex flex-col h-[90%] w-[90%] bg-white shadow-2xl rounded-md border-[1px] border-solid border-slate-200',
          {
            'h-full w-full': devMode,
          }
        )}
      >
        <div
          className="flex flex-row items-center p-4 slate"
          style={{ borderBottom: '1px solid rgb(226, 232, 240)' }}
        >
          <div className="flex flex-row items-center gap-1">
            <span className="text-3xl">Dave</span>
            <MessageSquareDashed />
            <span className="rounded-md uppercase text-xs bg-blue-100 px-1 font-semibold">
              experimental
            </span>
          </div>
          <div className="flex flex-row items-center ml-auto gap-3">
            {devMode && (
              <span className="rounded-md text-xs bg-green-100 px-1 font-semibold">
                You are currently in development mode
              </span>
            )}
            <Popover
              content={
                <div>
                  <p>
                    The model used for generation is:{' '}
                    <strong>
                      {settings?.useCustomSettings && settings.model
                        ? settings.model
                        : process.env.NEXT_PUBLIC_LLM_NAME || 'unknown'}
                    </strong>
                  </p>
                </div>
              }
            >
              <AntButton type="primary">Info</AntButton>
            </Popover>
            <GlobalAnonymizationToggle />
            <Tooltip content="Dev mode" placement="bottom" color="invert">
              <Switch
                onChange={handleModeChange}
                icon={<Code />}
                color="success"
                size="xl"
              />
            </Tooltip>
            <Button
              auto
              className="bg-slate-950"
              iconRight={<X size={20} />}
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
        <ChatProvider>
          <ChatPanel devMode={devMode} />
        </ChatProvider>
      </motion.div>
    );
  }
);

LLMSearch.displayName = 'LLMSearch';

export { LLMSearch };
