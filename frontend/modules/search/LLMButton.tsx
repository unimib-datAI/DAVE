import { useClickOutside } from '@/hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LLMSearch } from './LLMSearch';

const variantsLLM = {
  hidden: { opacity: 0, scale: 0.9, translateY: 20 },
  visible: { opacity: 1, scale: 1, translateY: 0 },
  exit: { opacity: 0, scale: 0.9, translateY: 20 },
};

const LLMButton = () => {
  const [openLLM, setOpenLLM] = useState(false);

  const openLLMWindow = () => {
    setOpenLLM(true);
    document.body.style.overflowY = 'hidden';
  };

  const closeLLMWindow = () => {
    setOpenLLM(false);
    document.body.style.overflowY = 'auto';
  };

  const refLLMWindow = useClickOutside(closeLLMWindow);

  // Cleanup: ensure body overflow is restored when component unmounts or LLM closes
  useEffect(() => {
    if (!openLLM) {
      document.body.style.overflowY = 'auto';
    }

    return () => {
      document.body.style.overflowY = 'auto';
    };
  }, [openLLM]);

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.2, rotate: 90 }}
        whileTap={{
          scale: 0.8,
          rotate: 0,
        }}
        onClick={openLLMWindow}
        className="cursor-pointer border-none fixed bottom-5 right-5 rounded-full bg-black p-2 text-white flex items-center justify-center h-14 w-14 z-[9989]"
      >
        <MessageCircle size={28} />
      </motion.button>
      <AnimatePresence>
        {openLLM && (
          <>
            <motion.div
              key={1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0  p-4 bg-neutral-700/10"
            />
            <motion.div
              key={2}
              variants={variantsLLM}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-0  p-4 flex items-center justify-center"
            >
              <LLMSearch ref={refLLMWindow} onClose={closeLLMWindow} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export { LLMButton };
