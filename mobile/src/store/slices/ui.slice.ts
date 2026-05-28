import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface UIState {
  isLoading: boolean;
  toast: Toast | null;
  theme: 'light' | 'dark';
  isNetworkConnected: boolean;
  isKeyboardVisible: boolean;
  activeModal: string | null;
}

const initialState: UIState = {
  isLoading: false,
  toast: null,
  theme: 'light',
  isNetworkConnected: true,
  isKeyboardVisible: false,
  activeModal: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    showToast: (
      state,
      action: PayloadAction<{ message: string; type: ToastType; duration?: number }>
    ) => {
      state.toast = {
        id: Date.now().toString(),
        message: action.payload.message,
        type: action.payload.type,
        duration: action.payload.duration || 3000,
      };
    },
    hideToast: (state) => {
      state.toast = null;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setNetworkConnected: (state, action: PayloadAction<boolean>) => {
      state.isNetworkConnected = action.payload;
    },
    setKeyboardVisible: (state, action: PayloadAction<boolean>) => {
      state.isKeyboardVisible = action.payload;
    },
    openModal: (state, action: PayloadAction<string>) => {
      state.activeModal = action.payload;
    },
    closeModal: (state) => {
      state.activeModal = null;
    },
  },
});

export const {
  setGlobalLoading,
  showToast,
  hideToast,
  setTheme,
  setNetworkConnected,
  setKeyboardVisible,
  openModal,
  closeModal,
} = uiSlice.actions;

export default uiSlice.reducer;
