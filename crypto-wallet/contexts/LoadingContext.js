import React, { createContext, useState, useContext, useCallback } from 'react';

const LoadingContext = createContext();

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

export const LoadingProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [loadingType, setLoadingType] = useState('default'); // 'default', 'progress', 'spinner'

  const showLoading = useCallback((message, options = {}) => {
    setIsLoading(true);
    setLoadingMessage(message);
    setCurrentStep(options.step || 0);
    setTotalSteps(options.totalSteps || 0);
    setLoadingType(options.type || 'default');
  }, []);

  const updateLoading = useCallback((message, step) => {
    setLoadingMessage(message);
    if (step !== undefined) {
      setCurrentStep(step);
    }
  }, []);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
    setLoadingMessage('');
    setCurrentStep(0);
    setTotalSteps(0);
    setLoadingType('default');
  }, []);

  const value = {
    isLoading,
    loadingMessage,
    currentStep,
    totalSteps,
    loadingType,
    showLoading,
    updateLoading,
    hideLoading,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};