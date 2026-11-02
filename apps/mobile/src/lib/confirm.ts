import { Alert, Platform } from 'react-native';

/** 跨平台确认框：原生用系统 Alert，Web 用浏览器 confirm */
export function confirm(message: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('', message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
