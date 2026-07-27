import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type DashboardProgressProps = {
  readonly value: number;
};

const WAVE_ONE_SOURCE = {
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABSgAAAA2CAYAAADEdXfEAAACM0lEQVR42u3dsQ3CMBRF0RuWpaVhChpapiUtA+A4kc8Z4UuWrl7jAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAs9mcYC2v9+frCv/xfNy9HwBAT6InASADpfhDpAIA6En0JAAZKBGICFAAQE+iJwEgA6U4BBEKAHoS9CQAGSgFIghQANCToCcBIAOlYATBCQB6EvQkABkoBSMITgDQkoCeBKBLDZSCEUQnAOhJQE8CZKAUjIDgBCADJKAnAehiA6VgBAQnAHoS0JMANGKgFIuA6ARATwJ6EoCOGigFJCAwAcggCehJPQnQoIFSMAIIToAMkAB6EuAgm4AEEJgAGSQB9CRABkoAwQmQARJATwKs1ZMGSgCBCWCQBNCTANN60kAJIDoBsQiAngSY1pMGSgDBCQhGAPQkwLSeNFACCE5AMAKgJwE9mU9yABCcgAESAD0JLNeTBkoA0QmIRQDQk6AnM1ACIDhBMAKAngQ9uRwDJQACFAQiAOhJ0JMZKAEQoSAOAQA9iZ7MQAkAAhSBCADoSfQkGSgBQKSKPwAAPYmezEAJAAAAADDEzQkAAAAAgAyUAAAAAEAGSgAAAACADJQAAAAAQAZKAAAAAIAMlAAAAABABkoAAAAAgAyUAAAAAEAGSgAAAACADJQAAAAAQAZKAAAAAIAMlAAAAABABkoAAAAAgF87NEzzTQpVYjgAAAAASUVORK5CYII=',
} as const;
const WAVE_TWO_SOURCE = {
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABSgAAAA2CAYAAADEdXfEAAACNElEQVR42u3YsQ3CQBBFwXc0S0pCFU6culoTQkiAdIc8U8IGq6dfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwmuEEAPC27cfpCr/xfNx1BgCgJ9GTZKAEQPwhUgEA9CR6MgMlAAhEBCgAoCfRk2SgBEAcgggFAD0JejIDJQACEQQoAOhJ0JMZKAFAMILgBAA9CXoyAyUAYhEEJwBoSuBSPSmIAcQiIDoB0JN6EvRkBkoABCNgwARATwKX60kxCyAYAcEJgJ4EmNaTYhVALAIYMQH0JMC0nhSiAAISwGAJoCcBpvWk8AQQjAAGTAA9CTCtJ8e2H6fABBCQAAZLAD0JMMP45lEKTkAwApABE0BPAjRpoBSYgIAEIIMlgJ4EaJGBUnQCYhGAjJiAngSghQdKwQkIRgD0JKAnAWjVgVJwAoIRAD0J6EkAxr8+b8EJghEA9CToSQAyUIpOQCwCoCcBPQlABkrBCYIRAPQk6EkAMlAKUBCIAICeRE8CQAZKEYo4BAD0JOhJADJQIkARiACAnkRPAkAGSpGK+AMA0JN6EgAyUAIAAAAA1M0JAAAAAIAMlAAAAABABkoAAAAAgAyUAAAAAEAGSgAAAACADJQAAAAAQAZKAAAAAIAMlAAAAABABkoAAAAAgAyUAAAAAEAGSgAAAACADJQAAAAAQAZKAAAAAIBPLz9T9gAfqNrDAAAAAElFTkSuQmCC',
} as const;

export function DashboardProgress({ value }: DashboardProgressProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const [progress] = useState(() => new Animated.Value(0));
  const [firstWave] = useState(() => new Animated.Value(0));
  const [secondWave] = useState(() => new Animated.Value(0));
  const [displayValue, setDisplayValue] = useState(0);
  const [tankWidth, setTankWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isMounted) setReduceMotion(isEnabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;

    const listenerId = progress.addListener(({ value: animatedValue }) => {
      setDisplayValue(Math.round(animatedValue));
    });

    progress.stopAnimation();
    progress.setValue(0);

    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 0 : 600,
      easing: Easing.bezier(0.5, 0, 0.3, 1.2),
      toValue: normalizedValue,
      useNativeDriver: false,
    });

    animation.start();

    return () => {
      animation.stop();
      progress.removeListener(listenerId);
    };
  }, [normalizedValue, progress, reduceMotion]);

  useEffect(() => {
    if (tankWidth === 0) return;

    let isActive = true;

    const startWaveCycle = (
      animatedValue: Animated.Value,
      duration: number,
    ) => {
      if (!isActive) return;

      animatedValue.setValue(0);
      Animated.timing(animatedValue, {
        duration,
        easing: Easing.linear,
        isInteraction: false,
        toValue: 1,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) startWaveCycle(animatedValue, duration);
      });
    };

    startWaveCycle(firstWave, 4_000);
    startWaveCycle(secondWave, 6_000);

    return () => {
      isActive = false;
      firstWave.stopAnimation();
      secondWave.stopAnimation();
    };
  }, [firstWave, secondWave, tankWidth]);

  const fillHeight = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  const firstWaveTranslate = firstWave.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -tankWidth],
  });
  const secondWaveTranslate = secondWave.interpolate({
    inputRange: [0, 1],
    outputRange: [-tankWidth, 0],
  });

  const handleLayout = (event: LayoutChangeEvent) => {
    setTankWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      accessibilityLabel={`${normalizedValue}% del mes transcurrido`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: normalizedValue }}
      onLayout={handleLayout}
      pointerEvents="none"
      style={styles.tank}
    >
      <Animated.View style={[styles.liquid, { height: fillHeight }]}>
        <Animated.View
          style={[
            styles.waveTrack,
            {
              transform: [{ translateX: firstWaveTranslate }],
              width: tankWidth * 2 + 1,
            },
          ]}
        >
          <WaveImages
            source={WAVE_ONE_SOURCE}
            tintColor="rgb(100, 106, 116)"
            width={tankWidth}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.waveTrack,
            styles.secondWave,
            {
              transform: [{ translateX: secondWaveTranslate }],
              width: tankWidth * 2 + 1,
            },
          ]}
        >
          <WaveImages
            source={WAVE_TWO_SOURCE}
            tintColor="rgb(100, 106, 116)"
            width={tankWidth}
          />
        </Animated.View>
      </Animated.View>

      <View pointerEvents="none" style={styles.label}>
        <Text style={styles.percentage}>{displayValue}%</Text>
        <Text style={styles.caption}>del mes transcurrido</Text>
      </View>
    </View>
  );
}

function WaveImages({
  source,
  tintColor,
  width,
}: {
  readonly source: ImageSourcePropType;
  readonly tintColor?: string;
  readonly width: number;
}) {
  return (
    <>
      <Animated.Image
        resizeMode="stretch"
        source={source}
        style={[styles.wave, { tintColor, width: width + 1 }]}
      />
      <Animated.Image
        resizeMode="stretch"
        source={source}
        style={[styles.wave, { left: width, tintColor, width: width + 1 }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: '#f4f4f5',
    fontSize: 14,
    letterSpacing: 0.56,
    textShadowColor: 'rgba(17, 19, 24, 0.75)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 4,
  },
  label: {
    alignItems: 'center',
    bottom: 22,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    position: 'absolute',
    right: 21,
    zIndex: 2,
  },
  liquid: {
    backgroundColor: '#646a74',
    bottom: 0,
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(139, 144, 153, 0.85) 0%, rgba(100, 106, 116, 0.95) 100%)',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  percentage: {
    color: '#ffffff',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textShadowColor: 'rgba(17, 19, 24, 0.75)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 4,
  },
  secondWave: {
    opacity: 0.55,
  },
  tank: {
    backgroundColor: '#111318',
    bottom: 0,
    experimental_backgroundImage:
      'linear-gradient(180deg, #111318 0%, #252932 100%)',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    shadowColor: '#111318',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    top: 0,
    zIndex: 0,
  },
  wave: {
    bottom: -1,
    height: 18,
    left: 0,
    position: 'absolute',
  },
  waveTrack: {
    bottom: '100%',
    height: 18,
    left: 0,
    opacity: 0.86,
    position: 'absolute',
  },
});
