import type React from 'react';
import type {LayoutRectangle, NativeMethods} from 'react-native';

export default function measureTooltipCoordinate(target: React.Component & Readonly<NativeMethods>, updateTargetBounds: (rect: LayoutRectangle) => void, showTooltip: () => void) {
    return target?.measureInWindow((x, y, width, height) => {
        updateTargetBounds({height, width, x, y});
        showTooltip();
    });
}

function getTooltipCoordinates(target: React.Component & Readonly<NativeMethods>, callback: (rect: LayoutRectangle) => void) {
    return target?.measureInWindow((x, y, width, height) => {
        callback({height, width, x, y});
    });
}

export {getTooltipCoordinates};
