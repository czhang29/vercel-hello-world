'use client';

import { useEffect, useState } from 'react';

type ToastProps = {
  message: string;
  visible: boolean;
  onHide: () => void;
};

export default function Toast({ message, visible, onHide }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, 2500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  return (
    <div className={`toast ${visible ? 'show' : ''}`}>
      {message}
    </div>
  );
}
