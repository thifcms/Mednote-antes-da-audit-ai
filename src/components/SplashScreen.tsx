import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './Logo';

export const SplashScreen: React.FC = () => {
  const [show, setShow] = useState(true);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B1628]"
        >
          {/* Background decorative elements */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.25, scale: 1.2 }}
            transition={{ duration: 4, ease: "linear", repeat: Infinity, repeatType: "reverse" }}
            className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-500 rounded-full blur-[140px]"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.2, scale: 1.1 }}
            transition={{ duration: 4, ease: "linear", delay: 0.5, repeat: Infinity, repeatType: "reverse" }}
            className="absolute bottom-1/4 -left-20 w-80 h-80 bg-gold-400 rounded-full blur-[120px]"
          />
          
          {/* Central Flare */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 0.15, scale: 1.5 }}
            transition={{ duration: 3, ease: "easeOut" }}
            className="absolute inset-0 m-auto w-96 h-64 bg-white/20 rounded-full blur-[120px]"
          />

          <div className="relative flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ 
                duration: 2.0, 
                ease: [0.22, 1, 0.36, 1] 
              }}
            >
              <Logo className="h-44 md:h-56" isDarkBackground={true} />
            </motion.div>

            {/* Elegant loading bar */}
            <div className="mt-20 w-64 h-[1px] bg-white/5 overflow-hidden rounded-full">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ 
                  duration: 4.0, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="w-full h-full bg-gradient-to-r from-transparent via-[#C9A030] to-transparent"
              />
            </div>
            
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ delay: 1, duration: 1 }}
              className="mt-6 text-[10px] text-[#8AACCC] font-bold uppercase tracking-[0.4em]"
            >
              Iniciando Sistema
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
