import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import CustomAlert from '../components/common/CustomAlert';
import { setCustomAlertRef } from '../utils/Alert';

const AlertContext = createContext();

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return context;
};

export const AlertProvider = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  const showAlert = useCallback((title, message, buttons) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      buttons: buttons || [{ text: 'OK' }],
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  // Set the reference for the Alert utility
  useEffect(() => {
    setCustomAlertRef({ showAlert, hideAlert });
    return () => setCustomAlertRef(null);
  }, [showAlert, hideAlert]);

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onDismiss={hideAlert}
      />
    </AlertContext.Provider>
  );
};