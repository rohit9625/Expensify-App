import type {PushPayload} from '@ua/react-native-airship';
import Airship, {EventType, PermissionStatus} from '@ua/react-native-airship';
import Log from '@libs/Log';
import ShortcutManager from '@libs/ShortcutManager';
import CONFIG from '@src/CONFIG';
import ForegroundNotifications from './ForegroundNotifications';
import type {NotificationDataMap, NotificationTypes} from './NotificationType';
import NotificationType from './NotificationType';
import parsePushNotificationPayload from './parsePushNotificationPayload';
import type {ClearNotifications, Deregister, Init, OnReceived, OnSelected, Register} from './types';
import type PushNotificationType from './types';

type NotificationEventHandler<T extends NotificationTypes> = (data: NotificationDataMap[T]) => Promise<void>;

type NotificationEventHandlerMap<T extends NotificationTypes> = Partial<Record<T, NotificationEventHandler<T>>>;

type NotificationEventActionMap = Partial<Record<EventType, NotificationEventHandlerMap<NotificationTypes>>>;

const notificationEventActionMap: NotificationEventActionMap = {};

/**
 * Handle a push notification event, and trigger and bound actions.
 */
function pushNotificationEventCallback(eventType: EventType, notification: PushPayload) {
    const actionMap = notificationEventActionMap[eventType] ?? {};

    const data = parsePushNotificationPayload(notification.extras.payload);

    Log.info(`[PushNotification] Callback triggered for ${eventType}`);

    if (!data) {
        Log.warn('[PushNotification] Notification has null or undefined payload, not executing any callback.');
        return;
    }

    if (!data.type) {
        Log.warn('[PushNotification] No type value provided in payload, not executing any callback.');
        return;
    }

    const action = actionMap[data.type];
    if (!action) {
        Log.warn('[PushNotification] No callback set up: ', {
            event: eventType,
            notificationType: data.type,
        });
        return;
    }

    /**
     * The action callback should return a promise. It's very important we return that promise so that
     * when these callbacks are run in Android's background process (via Headless JS), the process waits
     * for the promise to resolve before quitting
     */
    return action(data);
}

/**
 * Configure push notifications and register callbacks. This is separate from namedUser registration because it needs to be executed
 * from a headless JS process, outside of any react lifecycle.
 *
 * WARNING: Moving or changing this code could break Push Notification processing in non-obvious ways.
 *          DO NOT ALTER UNLESS YOU KNOW WHAT YOU'RE DOING. See this PR for details: https://github.com/Expensify/App/pull/3877
 */
const init: Init = () => {
    // Setup event listeners
    Airship.addListener(EventType.PushReceived, (notification) => pushNotificationEventCallback(EventType.PushReceived, notification.pushPayload));

    // Note: the NotificationResponse event has a nested PushReceived event,
    // so event.notification refers to the same thing as notification above ^
    Airship.addListener(EventType.NotificationResponse, (event) => pushNotificationEventCallback(EventType.NotificationResponse, event.pushPayload));

    ForegroundNotifications.configureForegroundNotifications();
};

/**
 * Register this device for push notifications for the given notificationID.
 */
const register: Register = (notificationID) => {
    Airship.contact
        .getNamedUserId()
        .then((userID) => {
            // In the HybridApp, the contact identity is set on the YAPL side after sign-in.
            // Since the Airship instance is shared between NewDot and OldDot,
            // NewDot users won't see the push notification permission prompt as we return early in this case.
            // Therefore, we cannot handle the HybridApp scenario here.
            if (!CONFIG.IS_HYBRID_APP && userID === notificationID.toString()) {
                // No need to register again for this notificationID.
                return;
            }

            // Get permissions to display push notifications if not determined (prompts user on iOS, but not Android)
            Airship.push.getNotificationStatus().then(({notificationPermissionStatus}) => {
                if (notificationPermissionStatus !== PermissionStatus.NotDetermined) {
                    return;
                }

                Airship.push.enableUserNotifications().then((isEnabled) => {
                    if (isEnabled) {
                        return;
                    }

                    Log.info('[PushNotification] User has disabled visible push notifications for this app.');
                });
            });

            // Register this device as a named user in AirshipAPI.
            // Regardless of the user's opt-in status, we still want to receive silent push notifications.
            Log.info(`[PushNotification] Subscribing to notifications`);
            Airship.contact.identify(notificationID.toString());
        })
        .catch((error: Record<string, unknown>) => {
            Log.warn('[PushNotification] Failed to register for push notifications! Reason: ', error);
        });
};

/**
 * Deregister this device from push notifications.
 */
const deregister: Deregister = () => {
    Log.info('[PushNotification] Unsubscribing from push notifications.');
    Airship.contact.reset();
    Airship.removeAllListeners(EventType.PushReceived);
    Airship.removeAllListeners(EventType.NotificationResponse);
    ForegroundNotifications.disableForegroundNotifications();
    ShortcutManager.removeAllDynamicShortcuts();
};

/**
 * Bind a callback to a push notification of a given type.
 * See https://github.com/Expensify/Web-Expensify/blob/main/lib/MobilePushNotifications.php for the various
 * types of push notifications sent, along with the data that they provide.
 *
 * Note: This implementation allows for only one callback to be bound to an Event/Type pair. For example,
 *       if we attempt to bind two callbacks to the PushReceived event for reportComment notifications,
 *       the second will overwrite the first.
 *
 * @param triggerEvent - The event that should trigger this callback. Should be one of UrbanAirship.EventType
 */
function bind<T extends NotificationTypes>(triggerEvent: EventType, notificationType: T, callback: NotificationEventHandler<T>) {
    let actionMap = notificationEventActionMap[triggerEvent] as NotificationEventHandlerMap<T> | undefined;

    if (!actionMap) {
        actionMap = {};
    }

    actionMap[notificationType] = callback;
    notificationEventActionMap[triggerEvent] = actionMap;
}

/**
 * Bind a callback to be executed when a push notification of a given type is received.
 */
const onReceived: OnReceived = (notificationType, callback) => {
    bind(EventType.PushReceived, notificationType, callback);
};

/**
 * Bind a callback to be executed when a push notification of a given type is tapped by the user.
 */
const onSelected: OnSelected = (notificationType, callback) => {
    bind(EventType.NotificationResponse, notificationType, callback);
};

/**
 * Clear all push notifications
 */
const clearNotifications: ClearNotifications = () => {
    Airship.push.clearNotifications();
};

const PushNotification: PushNotificationType = {
    init,
    register,
    deregister,
    onReceived,
    onSelected,
    TYPE: NotificationType,
    clearNotifications,
};

export default PushNotification;
