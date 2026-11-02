/**
 * 线性图标，1.6 描边，统一 24 网格。只画需要的几个，不引入图标库。
 */
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme';

export type IconName =
  | 'map'
  | 'week'
  | 'book'
  | 'you'
  | 'close'
  | 'back'
  | 'chevronLeft'
  | 'chevronRight'
  | 'camera'
  | 'locate'
  | 'pin'
  | 'share'
  | 'lock'
  | 'more'
  | 'traces'
  | 'search'
  | 'sort'
  | 'plus'
  | 'minus'
  | 'layers'
  | 'clock'
  | 'compass';

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  const s = color ?? c.ink;
  const p = { stroke: s, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'map' && <Path {...p} d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5V6.5ZM9 4v13.5M15 6.5V20" />}
      {name === 'week' && <Path {...p} d="M4 6.5h16M4 6.5v13h16v-13M8 3.5v4M16 3.5v4M7.5 11h9M7.5 15h5" />}
      {name === 'book' && <Path {...p} d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Zm0 0V20" />}
      {name === 'you' && (
        <>
          <Circle {...p} cx={12} cy={8.5} r={3.5} />
          <Path {...p} d="M5 19.5c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" />
        </>
      )}
      {name === 'close' && <Path {...p} d="M6 6l12 12M18 6 6 18" />}
      {name === 'back' && <Path {...p} d="M14.5 5.5 8 12l6.5 6.5" />}
      {name === 'chevronLeft' && <Path {...p} d="M14 7l-5 5 5 5" />}
      {name === 'chevronRight' && <Path {...p} d="M10 7l5 5-5 5" />}
      {name === 'camera' && (
        <>
          <Path {...p} d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4V8Z" />
          <Circle {...p} cx={12} cy={13.5} r={3.5} />
        </>
      )}
      {name === 'locate' && (
        <>
          <Circle {...p} cx={12} cy={12} r={6} />
          <Path {...p} d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path {...p} d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
          <Circle {...p} cx={12} cy={10} r={2.3} />
        </>
      )}
      {name === 'share' && <Path {...p} d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12v8h14v-8" />}
      {name === 'lock' && <Path {...p} d="M6.5 11h11v9h-11v-9ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />}
      {name === 'traces' && (
        <>
          <Circle {...p} cx={9.5} cy={9.5} r={5.5} />
          <Circle {...p} cx={14.5} cy={14.5} r={5.5} />
          <Circle cx={14.5} cy={14.5} r={1.2} fill={s} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...p} cx={10.5} cy={10.5} r={6} />
          <Path {...p} d="M15 15l5 5" />
        </>
      )}
      {name === 'sort' && <Path {...p} d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3" />}
      {name === 'plus' && <Path {...p} d="M12 5v14M5 12h14" />}
      {name === 'minus' && <Path {...p} d="M5 12h14" />}
      {name === 'layers' && <Path {...p} d="M12 4 3 8.5l9 4.5 9-4.5L12 4ZM3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" />}
      {name === 'clock' && (
        <>
          <Circle {...p} cx={12} cy={12} r={8} />
          <Path {...p} d="M12 7.5V12l3 2M4 5.5 6.5 3M20 5.5 17.5 3" />
        </>
      )}
      {name === 'compass' && (
        <>
          <Circle {...p} cx={12} cy={12} r={8.5} />
          <Path {...p} d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
        </>
      )}
      {name === 'more' && <Path {...p} d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={2.6} />}
    </Svg>
  );
}
