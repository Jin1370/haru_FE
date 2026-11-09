import { ReactNode } from "react";
import {
    Image,
    ImageSourcePropType,
    StyleSheet,
    View,
    ViewStyle,
} from "react-native";
import { themeBackgrounds } from "@/constants/theme";

interface PhotoBackgroundProps {
    children?: ReactNode;
    /** 없으면 현재 테마(낮/밤)의 배경 사진. */
    source?: ImageSourcePropType;
    /** Pixel radius for Image.blurRadius. Defaults to a light blur (2). */
    blurRadius?: number;
    style?: ViewStyle;
    /**
     * Kept for call-site compatibility — no longer used. Overlay was removed
     * so the photo renders untinted; consumers may still pass `variant` but
     * it is ignored.
     */
    variant?: "hero" | "app";
    overlayColors?: readonly [string, string, ...string[]];
}

export function PhotoBackground({
    children,
    source,
    blurRadius,
    style,
}: PhotoBackgroundProps) {
    const resolvedSource = source ?? themeBackgrounds.app;
    const resolvedBlur = blurRadius ?? 4;

    return (
        <View style={[styles.container, style]}>
            <Image
                source={resolvedSource}
                blurRadius={resolvedBlur}
                resizeMode="cover"
                style={styles.photo}
            />
            <View style={styles.content}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: "hidden",
    },
    photo: {
        ...StyleSheet.absoluteFillObject,
        width: "100%",
        height: "100%",
    },
    content: {
        flex: 1,
    },
});
