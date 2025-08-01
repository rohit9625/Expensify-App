import lodashDebounce from 'lodash/debounce';
import noop from 'lodash/noop';
import React, {memo, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import type {LayoutChangeEvent, MeasureInWindowOnSuccessCallback, NativeSyntheticEvent, TextInputFocusEventData, TextInputSelectionChangeEventData} from 'react-native';
import {View} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import {runOnUI, useSharedValue} from 'react-native-reanimated';
import type {Emoji} from '@assets/emojis/types';
import * as ActionSheetAwareScrollView from '@components/ActionSheetAwareScrollView';
import AttachmentComposerModal from '@components/AttachmentComposerModal';
import DragAndDropConsumer from '@components/DragAndDrop/Consumer';
import DropZoneUI from '@components/DropZone/DropZoneUI';
import DualDropZone from '@components/DropZone/DualDropZone';
import EmojiPickerButton from '@components/EmojiPicker/EmojiPickerButton';
import ExceededCommentLength from '@components/ExceededCommentLength';
import * as Expensicons from '@components/Icon/Expensicons';
import ImportedStateIndicator from '@components/ImportedStateIndicator';
import type {Mention} from '@components/MentionSuggestions';
import OfflineIndicator from '@components/OfflineIndicator';
import OfflineWithFeedback from '@components/OfflineWithFeedback';
import {usePersonalDetails} from '@components/OnyxListItemProvider';
import useCurrentUserPersonalDetails from '@hooks/useCurrentUserPersonalDetails';
import useDebounce from '@hooks/useDebounce';
import useFilesValidation from '@hooks/useFilesValidation';
import useHandleExceedMaxCommentLength from '@hooks/useHandleExceedMaxCommentLength';
import useHandleExceedMaxTaskTitleLength from '@hooks/useHandleExceedMaxTaskTitleLength';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useOnyx from '@hooks/useOnyx';
import useReportIsArchived from '@hooks/useReportIsArchived';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import canFocusInputOnScreenFocus from '@libs/canFocusInputOnScreenFocus';
import {canUseTouchScreen} from '@libs/DeviceCapabilities';
import DomUtils from '@libs/DomUtils';
import {getDraftComment} from '@libs/DraftCommentUtils';
import getModalState from '@libs/getModalState';
import getNonEmptyStringOnyxID from '@libs/getNonEmptyStringOnyxID';
import Performance from '@libs/Performance';
import {getLinkedTransactionID, isMoneyRequestAction} from '@libs/ReportActionsUtils';
import {
    canShowReportRecipientLocalTime,
    chatIncludesChronos,
    chatIncludesConcierge,
    getParentReport,
    getReportRecipientAccountIDs,
    isReportApproved,
    isReportTransactionThread,
    isSelfDM,
    isSettled,
    temporary_getMoneyRequestOptions,
} from '@libs/ReportUtils';
import {shouldRestrictUserBillableActions} from '@libs/SubscriptionUtils';
import {getTransactionID, hasReceipt as hasReceiptTransactionUtils, isDistanceRequest} from '@libs/TransactionUtils';
import willBlurTextInputOnTapOutsideFunc from '@libs/willBlurTextInputOnTapOutside';
import Navigation from '@navigation/Navigation';
import AgentZeroProcessingRequestIndicator from '@pages/home/report/AgentZeroProcessingRequestIndicator';
import ParticipantLocalTime from '@pages/home/report/ParticipantLocalTime';
import ReportTypingIndicator from '@pages/home/report/ReportTypingIndicator';
import type {FileObject} from '@pages/media/AttachmentModalScreen/types';
import {hideEmojiPicker, isActive as isActiveEmojiPickerAction} from '@userActions/EmojiPickerAction';
import {initMoneyRequest, replaceReceipt, setMoneyRequestParticipantsFromReport, setMoneyRequestReceipt} from '@userActions/IOU';
import {addAttachment as addAttachmentReportActions, setIsComposerFullSize} from '@userActions/Report';
import Timing from '@userActions/Timing';
import {buildOptimisticTransactionAndCreateDraft} from '@userActions/TransactionEdit';
import {isBlockedFromConcierge as isBlockedFromConciergeUserAction} from '@userActions/User';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type * as OnyxTypes from '@src/types/onyx';
import type * as OnyxCommon from '@src/types/onyx/OnyxCommon';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import AttachmentPickerWithMenuItems from './AttachmentPickerWithMenuItems';
import ComposerWithSuggestions from './ComposerWithSuggestions';
import type {ComposerRef, ComposerWithSuggestionsProps} from './ComposerWithSuggestions/ComposerWithSuggestions';
import SendButton from './SendButton';

type SuggestionsRef = {
    resetSuggestions: () => void;
    onSelectionChange?: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
    triggerHotkeyActions: (event: KeyboardEvent) => boolean | undefined;
    updateShouldShowSuggestionMenuToFalse: (shouldShowSuggestionMenu?: boolean) => void;
    setShouldBlockSuggestionCalc: (shouldBlock: boolean) => void;
    getSuggestions: () => Mention[] | Emoji[];
    getIsSuggestionsMenuVisible: () => boolean;
};

type ReportActionComposeProps = Pick<ComposerWithSuggestionsProps, 'reportID' | 'isComposerFullSize' | 'lastReportAction'> & {
    /** A method to call when the form is submitted */
    onSubmit: (newComment: string) => void;

    /** The report currently being looked at */
    report: OnyxEntry<OnyxTypes.Report>;

    /** Report transactions */
    reportTransactions?: OnyxEntry<OnyxTypes.Transaction[]>;

    /** The type of action that's pending  */
    pendingAction?: OnyxCommon.PendingAction;

    /** Whether the report is ready for display */
    isReportReadyForDisplay?: boolean;

    /** A method to call when the input is focus */
    onComposerFocus?: () => void;

    /** A method to call when the input is blur */
    onComposerBlur?: () => void;

    /** Should the input be disabled  */
    disabled?: boolean;

    /** Whether the main composer was hidden */
    didHideComposerInput?: boolean;
};

// We want consistent auto focus behavior on input between native and mWeb so we have some auto focus management code that will
// prevent auto focus on existing chat for mobile device
const shouldFocusInputOnScreenFocus = canFocusInputOnScreenFocus();

const willBlurTextInputOnTapOutside = willBlurTextInputOnTapOutsideFunc();

// eslint-disable-next-line import/no-mutable-exports
let onSubmitAction = noop;

function ReportActionCompose({
    disabled = false,
    isComposerFullSize = false,
    onSubmit,
    pendingAction,
    report,
    reportID,
    isReportReadyForDisplay = true,
    lastReportAction,
    onComposerFocus,
    onComposerBlur,
    didHideComposerInput,
    reportTransactions,
}: ReportActionComposeProps) {
    const actionSheetAwareScrollViewContext = useContext(ActionSheetAwareScrollView.ActionSheetAwareScrollViewContext);
    const styles = useThemeStyles();
    const theme = useTheme();
    const {translate} = useLocalize();
    // eslint-disable-next-line rulesdir/prefer-shouldUseNarrowLayout-instead-of-isSmallScreenWidth
    const {isSmallScreenWidth, isMediumScreenWidth, shouldUseNarrowLayout} = useResponsiveLayout();
    const {isOffline} = useNetwork();
    const actionButtonRef = useRef<View | HTMLDivElement | null>(null);
    const currentUserPersonalDetails = useCurrentUserPersonalDetails();
    const personalDetails = usePersonalDetails();
    const [blockedFromConcierge] = useOnyx(ONYXKEYS.NVP_BLOCKED_FROM_CONCIERGE, {canBeMissing: true});
    const [shouldShowComposeInput = true] = useOnyx(ONYXKEYS.SHOULD_SHOW_COMPOSE_INPUT, {canBeMissing: true});
    const [policy] = useOnyx(`${ONYXKEYS.COLLECTION.POLICY}${report?.policyID}`, {canBeMissing: true});
    const [newParentReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${report?.parentReportID}`, {canBeMissing: true});
    /**
     * Updates the Highlight state of the composer
     */
    const [isFocused, setIsFocused] = useState(() => {
        const initialModalState = getModalState();
        return shouldFocusInputOnScreenFocus && shouldShowComposeInput && !initialModalState?.isVisible && !initialModalState?.willAlertModalBecomeVisible;
    });
    const [isFullComposerAvailable, setIsFullComposerAvailable] = useState(isComposerFullSize);

    // A flag to indicate whether the onScroll callback is likely triggered by a layout change (caused by text change) or not
    const isScrollLikelyLayoutTriggered = useRef(false);

    /**
     * Reset isScrollLikelyLayoutTriggered to false.
     *
     * The function is debounced with a handpicked wait time to address 2 issues:
     * 1. There is a slight delay between onChangeText and onScroll
     * 2. Layout change will trigger onScroll multiple times
     */
    const debouncedLowerIsScrollLikelyLayoutTriggered = useDebounce(
        useCallback(() => (isScrollLikelyLayoutTriggered.current = false), []),
        500,
    );

    const raiseIsScrollLikelyLayoutTriggered = useCallback(() => {
        isScrollLikelyLayoutTriggered.current = true;
        debouncedLowerIsScrollLikelyLayoutTriggered();
    }, [debouncedLowerIsScrollLikelyLayoutTriggered]);

    const [isCommentEmpty, setIsCommentEmpty] = useState(() => {
        const draftComment = getDraftComment(reportID);
        return !draftComment || !!draftComment.match(CONST.REGEX.EMPTY_COMMENT);
    });

    /**
     * Updates the visibility state of the menu
     */
    const [isMenuVisible, setMenuVisibility] = useState(false);
    const [isAttachmentPreviewActive, setIsAttachmentPreviewActive] = useState(false);

    /**
     * Updates the composer when the comment length is exceeded
     * Shows red borders and prevents the comment from being sent
     */
    const {hasExceededMaxCommentLength, validateCommentMaxLength, setHasExceededMaxCommentLength} = useHandleExceedMaxCommentLength();
    const {hasExceededMaxTaskTitleLength, validateTaskTitleMaxLength, setHasExceededMaxTitleLength} = useHandleExceedMaxTaskTitleLength();
    const [exceededMaxLength, setExceededMaxLength] = useState<number | null>(null);

    const suggestionsRef = useRef<SuggestionsRef>(null);
    const composerRef = useRef<ComposerRef | undefined>(undefined);
    const reportParticipantIDs = useMemo(
        () =>
            Object.keys(report?.participants ?? {})
                .map(Number)
                .filter((accountID) => accountID !== currentUserPersonalDetails.accountID),
        [currentUserPersonalDetails.accountID, report?.participants],
    );

    const shouldShowReportRecipientLocalTime = useMemo(
        () => canShowReportRecipientLocalTime(personalDetails, report, currentUserPersonalDetails.accountID) && !isComposerFullSize,
        [personalDetails, report, currentUserPersonalDetails.accountID, isComposerFullSize],
    );

    const includesConcierge = useMemo(() => chatIncludesConcierge({participants: report?.participants}), [report?.participants]);
    const userBlockedFromConcierge = useMemo(() => isBlockedFromConciergeUserAction(blockedFromConcierge), [blockedFromConcierge]);
    const isBlockedFromConcierge = useMemo(() => includesConcierge && userBlockedFromConcierge, [includesConcierge, userBlockedFromConcierge]);
    const isReportArchived = useReportIsArchived(report?.reportID);

    const isTransactionThreadView = useMemo(() => isReportTransactionThread(report), [report]);
    const isExpensesReport = useMemo(() => reportTransactions && reportTransactions.length > 1, [reportTransactions]);

    const [reportActions] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report?.reportID}`, {
        canEvict: false,
        canBeMissing: true,
    });

    const iouAction = reportActions ? Object.values(reportActions).find((action) => isMoneyRequestAction(action)) : null;
    const linkedTransactionID = iouAction && !isExpensesReport ? getLinkedTransactionID(iouAction) : undefined;

    const transactionID = useMemo(() => getTransactionID(reportID) ?? linkedTransactionID, [reportID, linkedTransactionID]);

    const [transaction] = useOnyx(`${ONYXKEYS.COLLECTION.TRANSACTION}${getNonEmptyStringOnyxID(transactionID)}`, {canBeMissing: true});

    const isSingleTransactionView = useMemo(() => !!transaction && !!reportTransactions && reportTransactions.length === 1, [transaction, reportTransactions]);
    const shouldAddOrReplaceReceipt = (isTransactionThreadView || isSingleTransactionView) && !isDistanceRequest(transaction);

    const hasReceipt = useMemo(() => hasReceiptTransactionUtils(transaction), [transaction]);

    const shouldDisplayDualDropZone = useMemo(() => {
        const parentReport = getParentReport(report);
        const isSettledOrApproved = isSettled(report) || isSettled(parentReport) || isReportApproved({report}) || isReportApproved({report: parentReport});
        return (shouldAddOrReplaceReceipt && !isSettledOrApproved) || !!temporary_getMoneyRequestOptions(report, policy, reportParticipantIDs, isReportArchived).length;
    }, [shouldAddOrReplaceReceipt, report, policy, reportParticipantIDs]);

    // Placeholder to display in the chat input.
    const inputPlaceholder = useMemo(() => {
        if (includesConcierge && userBlockedFromConcierge) {
            return translate('reportActionCompose.blockedFromConcierge');
        }
        return translate('reportActionCompose.writeSomething');
    }, [includesConcierge, translate, userBlockedFromConcierge]);

    const focus = () => {
        if (composerRef.current === null) {
            return;
        }
        composerRef.current?.focus(true);
    };

    const isKeyboardVisibleWhenShowingModalRef = useRef(false);
    const isNextModalWillOpenRef = useRef(false);

    const containerRef = useRef<View>(null);
    const measureContainer = useCallback(
        (callback: MeasureInWindowOnSuccessCallback) => {
            if (!containerRef.current) {
                return;
            }
            containerRef.current.measureInWindow(callback);
        },
        // We added isComposerFullSize in dependencies so that when this value changes, we recalculate the position of the popup
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [isComposerFullSize],
    );

    const onAddActionPressed = useCallback(() => {
        if (!willBlurTextInputOnTapOutside) {
            isKeyboardVisibleWhenShowingModalRef.current = !!composerRef.current?.isFocused();
        }
        composerRef.current?.blur();
    }, []);

    const onItemSelected = useCallback(() => {
        isKeyboardVisibleWhenShowingModalRef.current = false;
    }, []);

    const updateShouldShowSuggestionMenuToFalse = useCallback(() => {
        if (!suggestionsRef.current) {
            return;
        }
        suggestionsRef.current.updateShouldShowSuggestionMenuToFalse(false);
    }, []);

    const attachmentFileRef = useRef<FileObject | FileObject[] | null>(null);

    const addAttachment = useCallback((file: FileObject | FileObject[]) => {
        attachmentFileRef.current = file;
        const clear = composerRef.current?.clear;
        if (!clear) {
            throw new Error('The composerRef.clear function is not set yet. This should never happen, and indicates a developer error.');
        }

        runOnUI(clear)();
    }, []);

    /**
     * Event handler to update the state after the attachment preview is closed.
     */
    const onAttachmentPreviewClose = useCallback(() => {
        updateShouldShowSuggestionMenuToFalse();
        setIsAttachmentPreviewActive(false);
    }, [updateShouldShowSuggestionMenuToFalse]);

    /**
     * Add a new comment to this chat
     */
    const submitForm = useCallback(
        (newComment: string) => {
            const newCommentTrimmed = newComment.trim();

            if (attachmentFileRef.current) {
                if (Array.isArray(attachmentFileRef.current)) {
                    // Handle multiple files
                    attachmentFileRef.current.forEach((file) => {
                        addAttachmentReportActions(reportID, file, newCommentTrimmed, true);
                    });
                } else {
                    // Handle single file
                    addAttachmentReportActions(reportID, attachmentFileRef.current, newCommentTrimmed, true);
                }
                attachmentFileRef.current = null;
            } else {
                Performance.markStart(CONST.TIMING.SEND_MESSAGE, {message: newCommentTrimmed});
                Timing.start(CONST.TIMING.SEND_MESSAGE);
                onSubmit(newCommentTrimmed);
            }
        },
        [onSubmit, reportID],
    );

    const onTriggerAttachmentPicker = useCallback(() => {
        isNextModalWillOpenRef.current = true;
        isKeyboardVisibleWhenShowingModalRef.current = true;
    }, []);

    const onBlur = useCallback(
        (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
            const webEvent = event as unknown as FocusEvent;
            setIsFocused(false);
            onComposerBlur?.();
            if (suggestionsRef.current) {
                suggestionsRef.current.resetSuggestions();
            }
            if (webEvent.relatedTarget && webEvent.relatedTarget === actionButtonRef.current) {
                isKeyboardVisibleWhenShowingModalRef.current = true;
            }
        },
        [onComposerBlur],
    );

    const onFocus = useCallback(() => {
        setIsFocused(true);
        onComposerFocus?.();
    }, [onComposerFocus]);

    useEffect(() => {
        if (hasExceededMaxTaskTitleLength) {
            setExceededMaxLength(CONST.TITLE_CHARACTER_LIMIT);
        } else if (hasExceededMaxCommentLength) {
            setExceededMaxLength(CONST.MAX_COMMENT_LENGTH);
        } else {
            setExceededMaxLength(null);
        }
    }, [hasExceededMaxTaskTitleLength, hasExceededMaxCommentLength]);

    // We are returning a callback here as we want to invoke the method on unmount only
    useEffect(
        () => () => {
            if (!isActiveEmojiPickerAction(report?.reportID)) {
                return;
            }
            hideEmojiPicker();
        },
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [],
    );

    // When we invite someone to a room they don't have the policy object, but we still want them to be able to mention other reports they are members of, so we only check if the policyID in the report is from a workspace
    const isGroupPolicyReport = useMemo(() => !!report?.policyID && report.policyID !== CONST.POLICY.ID_FAKE, [report]);
    const reportRecipientAccountIDs = getReportRecipientAccountIDs(report, currentUserPersonalDetails.accountID);
    const reportRecipient = personalDetails?.[reportRecipientAccountIDs[0]];
    const shouldUseFocusedColor = !isBlockedFromConcierge && !disabled && isFocused;

    const hasReportRecipient = !isEmptyObject(reportRecipient);

    const isSendDisabled = isCommentEmpty || isBlockedFromConcierge || !!disabled || !!exceededMaxLength;

    // Note: using JS refs is not well supported in reanimated, thus we need to store the function in a shared value
    // useSharedValue on web doesn't support functions, so we need to wrap it in an object.
    const composerRefShared = useSharedValue<{
        clear: (() => void) | undefined;
    }>({clear: undefined});

    const handleSendMessage = useCallback(() => {
        'worklet';

        const clearComposer = composerRefShared.get().clear;
        if (!clearComposer) {
            throw new Error('The composerRefShared.clear function is not set yet. This should never happen, and indicates a developer error.');
        }

        if (isSendDisabled || !isReportReadyForDisplay) {
            return;
        }

        // This will cause onCleared to be triggered where we actually send the message
        clearComposer();
    }, [isSendDisabled, isReportReadyForDisplay, composerRefShared]);

    const measureComposer = useCallback(
        (e: LayoutChangeEvent) => {
            actionSheetAwareScrollViewContext.transitionActionSheetState({
                type: ActionSheetAwareScrollView.Actions.MEASURE_COMPOSER,
                payload: {
                    composerHeight: e.nativeEvent.layout.height,
                },
            });
        },
        [actionSheetAwareScrollViewContext],
    );

    // eslint-disable-next-line react-compiler/react-compiler
    onSubmitAction = handleSendMessage;

    const emojiPositionValues = useMemo(
        () => ({
            secondaryRowHeight: styles.chatItemComposeSecondaryRow.height,
            secondaryRowMarginTop: styles.chatItemComposeSecondaryRow.marginTop,
            secondaryRowMarginBottom: styles.chatItemComposeSecondaryRow.marginBottom,
            composeBoxMinHeight: styles.chatItemComposeBox.minHeight,
            emojiButtonHeight: styles.chatItemEmojiButton.height,
        }),
        [
            styles.chatItemComposeSecondaryRow.height,
            styles.chatItemComposeSecondaryRow.marginTop,
            styles.chatItemComposeSecondaryRow.marginBottom,
            styles.chatItemComposeBox.minHeight,
            styles.chatItemEmojiButton.height,
        ],
    );

    const emojiShiftVertical = useMemo(() => {
        const chatItemComposeSecondaryRowHeight = emojiPositionValues.secondaryRowHeight + emojiPositionValues.secondaryRowMarginTop + emojiPositionValues.secondaryRowMarginBottom;
        const reportActionComposeHeight = emojiPositionValues.composeBoxMinHeight + chatItemComposeSecondaryRowHeight;
        const emojiOffsetWithComposeBox = (emojiPositionValues.composeBoxMinHeight - emojiPositionValues.emojiButtonHeight) / 2;
        return reportActionComposeHeight - emojiOffsetWithComposeBox - CONST.MENU_POSITION_REPORT_ACTION_COMPOSE_BOTTOM;
    }, [emojiPositionValues]);

    const validateMaxLength = useCallback(
        (value: string) => {
            const taskCommentMatch = value?.match(CONST.REGEX.TASK_TITLE_WITH_OPTIONAL_SHORT_MENTION);
            if (taskCommentMatch) {
                const title = taskCommentMatch?.[3] ? taskCommentMatch[3].trim().replace(/\n/g, ' ') : '';
                setHasExceededMaxCommentLength(false);
                validateTaskTitleMaxLength(title);
            } else {
                setHasExceededMaxTitleLength(false);
                validateCommentMaxLength(value, {reportID});
            }
        },
        [setHasExceededMaxCommentLength, setHasExceededMaxTitleLength, validateTaskTitleMaxLength, validateCommentMaxLength, reportID],
    );

    const debouncedValidate = useMemo(() => lodashDebounce(validateMaxLength, CONST.TIMING.COMMENT_LENGTH_DEBOUNCE_TIME, {leading: true}), [validateMaxLength]);

    const onValueChange = useCallback(
        (value: string) => {
            if (value.length === 0 && isComposerFullSize) {
                setIsComposerFullSize(reportID, false);
            }
            debouncedValidate(value);
        },
        [isComposerFullSize, reportID, debouncedValidate],
    );

    const saveFileAndInitMoneyRequest = (files: FileObject[]) => {
        if (files.length === 0) {
            return;
        }
        if (shouldAddOrReplaceReceipt && transactionID) {
            const source = URL.createObjectURL(files.at(0) as Blob);
            replaceReceipt({transactionID, file: files.at(0) as File, source});
        } else {
            const initialTransaction = initMoneyRequest({
                reportID,
                newIouRequestType: CONST.IOU.REQUEST_TYPE.SCAN,
                report,
                parentReport: newParentReport,
            });

            files.forEach((file, index) => {
                const source = URL.createObjectURL(file as Blob);
                const newTransaction =
                    index === 0
                        ? (initialTransaction as Partial<OnyxTypes.Transaction>)
                        : buildOptimisticTransactionAndCreateDraft({
                              initialTransaction: initialTransaction as Partial<OnyxTypes.Transaction>,
                              currentUserPersonalDetails,
                              reportID,
                          });
                const newTransactionID = newTransaction?.transactionID ?? CONST.IOU.OPTIMISTIC_TRANSACTION_ID;
                setMoneyRequestReceipt(newTransactionID, source, file.name ?? '', true);
                setMoneyRequestParticipantsFromReport(newTransactionID, report);
            });
            Navigation.navigate(
                ROUTES.MONEY_REQUEST_STEP_CONFIRMATION.getRoute(
                    CONST.IOU.ACTION.CREATE,
                    isSelfDM(report) ? CONST.IOU.TYPE.TRACK : CONST.IOU.TYPE.SUBMIT,
                    CONST.IOU.OPTIMISTIC_TRANSACTION_ID,
                    reportID,
                ),
            );
        }
    };

    const {validateFiles, PDFValidationComponent, ErrorModal} = useFilesValidation(saveFileAndInitMoneyRequest);

    const handleAddingReceipt = (e: DragEvent) => {
        if (policy && shouldRestrictUserBillableActions(policy.id)) {
            Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(policy.id));
            return;
        }
        if (shouldAddOrReplaceReceipt && transactionID) {
            const file = e?.dataTransfer?.files?.[0];
            if (file) {
                file.uri = URL.createObjectURL(file);
                validateFiles([file], Array.from(e.dataTransfer?.items ?? []));
                return;
            }
        }

        const files = Array.from(e?.dataTransfer?.files ?? []);
        if (files.length === 0) {
            return;
        }
        files.forEach((file) => {
            // eslint-disable-next-line no-param-reassign
            file.uri = URL.createObjectURL(file);
        });

        validateFiles(files, Array.from(e.dataTransfer?.items ?? []));
    };

    return (
        <View style={[shouldShowReportRecipientLocalTime && !isOffline && styles.chatItemComposeWithFirstRow, isComposerFullSize && styles.chatItemFullComposeRow]}>
            <OfflineWithFeedback pendingAction={pendingAction}>
                {shouldShowReportRecipientLocalTime && hasReportRecipient && <ParticipantLocalTime participant={reportRecipient} />}
            </OfflineWithFeedback>
            <View
                onLayout={measureComposer}
                style={isComposerFullSize ? styles.flex1 : {}}
            >
                <OfflineWithFeedback
                    shouldDisableOpacity
                    pendingAction={pendingAction}
                    style={isComposerFullSize ? styles.chatItemFullComposeRow : {}}
                    contentContainerStyle={isComposerFullSize ? styles.flex1 : {}}
                >
                    <View
                        ref={containerRef}
                        style={[
                            shouldUseFocusedColor ? styles.chatItemComposeBoxFocusedColor : styles.chatItemComposeBoxColor,
                            styles.flexRow,
                            styles.chatItemComposeBox,
                            isComposerFullSize && styles.chatItemFullComposeBox,
                            !!exceededMaxLength && styles.borderColorDanger,
                        ]}
                    >
                        {PDFValidationComponent}
                        <AttachmentComposerModal
                            headerTitle={translate('reportActionCompose.sendAttachment')}
                            onConfirm={addAttachment}
                            onModalShow={() => setIsAttachmentPreviewActive(true)}
                            onModalHide={onAttachmentPreviewClose}
                            shouldDisableSendButton={!!exceededMaxLength}
                            report={report}
                        >
                            {({displayFilesInModal}) => {
                                const handleAttachmentDrop = (event: DragEvent) => {
                                    if (isAttachmentPreviewActive) {
                                        return;
                                    }
                                    if (event.dataTransfer?.files.length && event.dataTransfer?.files.length > 1) {
                                        const files = Array.from(event.dataTransfer?.files).map((file) => {
                                            // eslint-disable-next-line no-param-reassign
                                            file.uri = URL.createObjectURL(file);
                                            return file;
                                        });
                                        displayFilesInModal(files, Array.from(event.dataTransfer?.items ?? []));
                                        return;
                                    }

                                    const data = event.dataTransfer?.files[0];
                                    if (data) {
                                        data.uri = URL.createObjectURL(data);
                                        displayFilesInModal([data], Array.from(event.dataTransfer?.items ?? []));
                                    }
                                };

                                return (
                                    <>
                                        <AttachmentPickerWithMenuItems
                                            displayFilesInModal={displayFilesInModal}
                                            reportID={reportID}
                                            report={report}
                                            currentUserPersonalDetails={currentUserPersonalDetails}
                                            reportParticipantIDs={reportParticipantIDs}
                                            isFullComposerAvailable={isFullComposerAvailable}
                                            isComposerFullSize={isComposerFullSize}
                                            isBlockedFromConcierge={isBlockedFromConcierge}
                                            disabled={disabled}
                                            setMenuVisibility={setMenuVisibility}
                                            isMenuVisible={isMenuVisible}
                                            onTriggerAttachmentPicker={onTriggerAttachmentPicker}
                                            raiseIsScrollLikelyLayoutTriggered={raiseIsScrollLikelyLayoutTriggered}
                                            onAddActionPressed={onAddActionPressed}
                                            onItemSelected={onItemSelected}
                                            onCanceledAttachmentPicker={() => {
                                                if (!shouldFocusInputOnScreenFocus) {
                                                    return;
                                                }
                                                focus();
                                            }}
                                            actionButtonRef={actionButtonRef}
                                            shouldDisableAttachmentItem={!!exceededMaxLength}
                                        />
                                        <ComposerWithSuggestions
                                            ref={(ref) => {
                                                composerRef.current = ref ?? undefined;
                                                composerRefShared.set({
                                                    clear: ref?.clear,
                                                });
                                            }}
                                            suggestionsRef={suggestionsRef}
                                            isNextModalWillOpenRef={isNextModalWillOpenRef}
                                            isScrollLikelyLayoutTriggered={isScrollLikelyLayoutTriggered}
                                            raiseIsScrollLikelyLayoutTriggered={raiseIsScrollLikelyLayoutTriggered}
                                            reportID={reportID}
                                            policyID={report?.policyID}
                                            includeChronos={chatIncludesChronos(report)}
                                            isGroupPolicyReport={isGroupPolicyReport}
                                            lastReportAction={lastReportAction}
                                            isMenuVisible={isMenuVisible}
                                            inputPlaceholder={inputPlaceholder}
                                            isComposerFullSize={isComposerFullSize}
                                            setIsFullComposerAvailable={setIsFullComposerAvailable}
                                            displayFilesInModal={displayFilesInModal}
                                            onCleared={submitForm}
                                            isBlockedFromConcierge={isBlockedFromConcierge}
                                            disabled={disabled}
                                            setIsCommentEmpty={setIsCommentEmpty}
                                            handleSendMessage={handleSendMessage}
                                            shouldShowComposeInput={shouldShowComposeInput}
                                            onFocus={onFocus}
                                            onBlur={onBlur}
                                            measureParentContainer={measureContainer}
                                            onValueChange={onValueChange}
                                            didHideComposerInput={didHideComposerInput}
                                        />
                                        {shouldDisplayDualDropZone && (
                                            <DualDropZone
                                                isEditing={shouldAddOrReplaceReceipt && hasReceipt}
                                                onAttachmentDrop={handleAttachmentDrop}
                                                onReceiptDrop={handleAddingReceipt}
                                                shouldAcceptSingleReceipt={shouldAddOrReplaceReceipt}
                                            />
                                        )}
                                        {!shouldDisplayDualDropZone && (
                                            <DragAndDropConsumer onDrop={handleAttachmentDrop}>
                                                <DropZoneUI
                                                    icon={Expensicons.MessageInABottle}
                                                    dropTitle={translate('dropzone.addAttachments')}
                                                    dropStyles={styles.attachmentDropOverlay(true)}
                                                    dropTextStyles={styles.attachmentDropText}
                                                    dashedBorderStyles={styles.activeDropzoneDashedBorder(theme.attachmentDropBorderColorActive, true)}
                                                />
                                            </DragAndDropConsumer>
                                        )}
                                    </>
                                );
                            }}
                        </AttachmentComposerModal>
                        {canUseTouchScreen() && isMediumScreenWidth ? null : (
                            <EmojiPickerButton
                                isDisabled={isBlockedFromConcierge || disabled}
                                onModalHide={(isNavigating) => {
                                    if (isNavigating) {
                                        return;
                                    }
                                    const activeElementId = DomUtils.getActiveElement()?.id;
                                    if (activeElementId === CONST.COMPOSER.NATIVE_ID || activeElementId === CONST.EMOJI_PICKER_BUTTON_NATIVE_ID) {
                                        return;
                                    }
                                    focus();
                                }}
                                onEmojiSelected={(...args) => composerRef.current?.replaceSelectionWithText(...args)}
                                emojiPickerID={report?.reportID}
                                shiftVertical={emojiShiftVertical}
                            />
                        )}
                        <SendButton
                            isDisabled={isSendDisabled}
                            handleSendMessage={handleSendMessage}
                        />
                    </View>
                    {ErrorModal}
                    <View
                        style={[
                            styles.flexRow,
                            styles.justifyContentBetween,
                            styles.alignItemsCenter,
                            (!isSmallScreenWidth || (isSmallScreenWidth && !isOffline)) && styles.chatItemComposeSecondaryRow,
                        ]}
                    >
                        {!shouldUseNarrowLayout && <OfflineIndicator containerStyles={[styles.chatItemComposeSecondaryRow]} />}
                        <AgentZeroProcessingRequestIndicator reportID={reportID} />
                        <ReportTypingIndicator reportID={reportID} />
                        {!!exceededMaxLength && (
                            <ExceededCommentLength
                                maxCommentLength={exceededMaxLength}
                                isTaskTitle={hasExceededMaxTaskTitleLength}
                            />
                        )}
                    </View>
                </OfflineWithFeedback>
                {!isSmallScreenWidth && (
                    <View style={[styles.mln5, styles.mrn5]}>
                        <ImportedStateIndicator />
                    </View>
                )}
            </View>
        </View>
    );
}

ReportActionCompose.displayName = 'ReportActionCompose';

export default memo(ReportActionCompose);
export {onSubmitAction};
export type {SuggestionsRef, ComposerRef};
