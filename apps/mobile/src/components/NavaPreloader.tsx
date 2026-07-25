/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static asset paths. */
import MaskedView from '@react-native-masked-view/masked-view';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

// These pieces are positioned using the source manifest's 988 x 454 canvas.
const iconLeft = require('../../assets/preloader/01-icon-left.png') as number;
const iconRight = require('../../assets/preloader/02-icon-right.png') as number;
const iconDiagonal =
  require('../../assets/preloader/03-icon-diagonal.png') as number;
const wordmark =
  require('../../assets/preloader/04-wordmark-nava.png') as number;

const CANVAS_WIDTH = 988;
const CANVAS_HEIGHT = 454;
const PRELOAD_DURATION_MS = 3_200;

interface NavaPreloaderProps {
  readonly onFinish: () => void;
}

function lockPiece(
  value: Animated.Value,
  approachDuration: number,
): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.timing(value, {
      duration: approachDuration,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      toValue: 1,
      useNativeDriver: true,
    }),
    Animated.timing(value, {
      duration: 140,
      easing: Easing.out(Easing.cubic),
      toValue: 2,
      useNativeDriver: true,
    }),
  ]);
}

export function NavaPreloader({ onFinish }: NavaPreloaderProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const [leftProgress] = useState(() => new Animated.Value(0));
  const [rightProgress] = useState(() => new Animated.Value(0));
  const [diagonalProgress] = useState(() => new Animated.Value(0));
  const [shineProgress] = useState(() => new Animated.Value(0));
  const [wordmarkProgress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.stagger(105, [
        lockPiece(leftProgress, 900),
        lockPiece(rightProgress, 900),
        lockPiece(diagonalProgress, 900),
      ]),
      Animated.sequence([
        Animated.delay(1_250),
        Animated.timing(shineProgress, {
          duration: 450,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1_550),
        Animated.timing(wordmarkProgress, {
          duration: 750,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          toValue: 1,
          useNativeDriver: false,
        }),
      ]),
      Animated.delay(PRELOAD_DURATION_MS),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => {
      animation.stop();
    };
  }, [
    diagonalProgress,
    leftProgress,
    onFinish,
    rightProgress,
    shineProgress,
    wordmarkProgress,
  ]);

  const stageWidth = Math.min(viewportWidth * 0.9, 430);
  const scale = stageWidth / CANVAS_WIDTH;
  const stageHeight = CANVAS_HEIGHT * scale;

  const left = {
    height: 275 * scale,
    left: 40 * scale,
    top: 72 * scale,
    width: 141 * scale,
  };
  const right = {
    height: 303 * scale,
    left: 181 * scale,
    top: 44 * scale,
    width: 139 * scale,
  };
  const diagonal = {
    height: 304 * scale,
    left: 41 * scale,
    top: 43 * scale,
    width: 279 * scale,
  };
  const word = {
    height: 181 * scale,
    left: 386 * scale,
    top: 139 * scale,
    width: 579 * scale,
  };

  const pieceOpacity = (progress: Animated.Value) =>
    progress.interpolate({
      extrapolate: 'clamp',
      inputRange: [0, 0.22, 2],
      outputRange: [0, 1, 1],
    });

  return (
    <View
      accessibilityLabel="Nava"
      accessibilityViewIsModal
      accessible
      style={styles.screen}
      testID="nava-preloader"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: stageHeight, width: stageWidth }}
      >
        <Animated.Image
          resizeMode="contain"
          source={iconLeft}
          style={[
            styles.layer,
            left,
            {
              opacity: pieceOpacity(leftProgress),
              transform: [
                {
                  translateX: leftProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [-stageWidth * 0.06, stageWidth * 0.02, 0],
                  }),
                },
                {
                  translateY: leftProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [stageHeight * 0.02, -stageHeight * 0.006, 0],
                  }),
                },
                {
                  rotate: leftProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: ['-3deg', '0.15deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        />

        <Animated.Image
          resizeMode="contain"
          source={iconRight}
          style={[
            styles.layer,
            right,
            {
              opacity: pieceOpacity(rightProgress),
              transform: [
                {
                  translateX: rightProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [stageWidth * 0.06, -stageWidth * 0.02, 0],
                  }),
                },
                {
                  translateY: rightProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [-stageHeight * 0.02, stageHeight * 0.006, 0],
                  }),
                },
                {
                  rotate: rightProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: ['3deg', '-0.15deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        />

        <Animated.Image
          resizeMode="contain"
          source={iconDiagonal}
          style={[
            styles.layer,
            diagonal,
            {
              opacity: pieceOpacity(diagonalProgress),
              transform: [
                {
                  translateX: diagonalProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [stageWidth * 0.035, -stageWidth * 0.012, 0],
                  }),
                },
                {
                  translateY: diagonalProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [-stageHeight * 0.03, stageHeight * 0.01, 0],
                  }),
                },
                {
                  rotate: diagonalProgress.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: ['4deg', '-0.18deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        />

        <MaskedView
          maskElement={
            <Image
              resizeMode="contain"
              source={iconDiagonal}
              style={{ height: diagonal.height, width: diagonal.width }}
            />
          }
          pointerEvents="none"
          style={[styles.layer, diagonal]}
        >
          <Animated.View
            style={[
              styles.shine,
              {
                height: diagonal.height * 1.45,
                opacity: shineProgress.interpolate({
                  inputRange: [0, 0.16, 0.84, 1],
                  outputRange: [0, 0.55, 0.55, 0],
                }),
                transform: [
                  {
                    translateX: shineProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        -diagonal.width * 0.3,
                        diagonal.width * 1.12,
                      ],
                    }),
                  },
                  { rotate: '-12deg' },
                ],
                width: Math.max(12, 34 * scale),
              },
            ]}
          >
            <View style={styles.shineEdge} />
            <View style={styles.shineCore} />
            <View style={styles.shineEdge} />
          </Animated.View>
        </MaskedView>

        <Animated.View
          style={[
            styles.wordmarkClip,
            {
              height: word.height,
              left: word.left,
              top: word.top,
              width: wordmarkProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, word.width],
              }),
            },
          ]}
        >
          <Animated.Image
            resizeMode="contain"
            source={wordmark}
            style={[
              styles.layer,
              {
                height: word.height,
                opacity: wordmarkProgress,
                transform: [
                  {
                    translateX: wordmarkProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24 * scale, 0],
                    }),
                  },
                ],
                width: word.width,
              },
            ]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
  },
  screen: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#fcfcfb',
    justifyContent: 'center',
    zIndex: 100,
  },
  shine: {
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    top: '-22%',
  },
  shineCore: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flex: 1.2,
  },
  shineEdge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    flex: 1,
  },
  wordmarkClip: {
    overflow: 'hidden',
    position: 'absolute',
  },
});
