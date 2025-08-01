/* eslint-disable react-compiler/react-compiler */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Dimensions} from 'react-native';
import type {EmitterSubscription, GestureResponderEvent, View} from 'react-native';
import AddPaymentMethodMenu from '@components/AddPaymentMethodMenu';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import {openPersonalBankAccountSetupView} from '@libs/actions/BankAccounts';
import {completePaymentOnboarding, savePreferredPaymentMethod} from '@libs/actions/IOU';
import {moveIOUReportToPolicy, moveIOUReportToPolicyAndInviteSubmitter} from '@libs/actions/Report';
import getClickedTargetLocation from '@libs/getClickedTargetLocation';
import Log from '@libs/Log';
import Navigation from '@libs/Navigation/Navigation';
import {hasExpensifyPaymentMethod} from '@libs/PaymentUtils';
import {getBankAccountRoute, getPolicyExpenseChat, isExpenseReport as isExpenseReportReportUtils, isIOUReport} from '@libs/ReportUtils';
import {kycWallRef} from '@userActions/PaymentMethods';
import {createWorkspaceFromIOUPayment} from '@userActions/Policy/Policy';
import {setKYCWallSource} from '@userActions/Wallet';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {BankAccountList, Policy} from '@src/types/onyx';
import type {PaymentMethodType} from '@src/types/onyx/OriginalMessage';
import {getEmptyObject} from '@src/types/utils/EmptyObject';
import viewRef from '@src/types/utils/viewRef';
import type {AnchorPosition, DomRect, KYCWallProps, PaymentMethod} from './types';

// This sets the Horizontal anchor position offset for POPOVER MENU.
const POPOVER_MENU_ANCHOR_POSITION_HORIZONTAL_OFFSET = 20;

// This component allows us to block various actions by forcing the user to first add a default payment method and successfully make it through our Know Your Customer flow
// before continuing to take whatever action they originally intended to take. It requires a button as a child and a native event so we can get the coordinates and use it
// to render the AddPaymentMethodMenu in the correct location.
function KYCWall({
    addBankAccountRoute,
    addDebitCardRoute,
    anchorAlignment = {
        horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.LEFT,
        vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
    },
    chatReportID = '',
    children,
    enablePaymentsRoute,
    iouReport,
    onSelectPaymentMethod = () => {},
    onSuccessfulKYC,
    shouldIncludeDebitCard = true,
    shouldListenForResize = false,
    source,
    shouldShowPersonalBankAccountOption = false,
}: KYCWallProps) {
    const [userWallet] = useOnyx(ONYXKEYS.USER_WALLET, {canBeMissing: true});
    const [walletTerms] = useOnyx(ONYXKEYS.WALLET_TERMS, {canBeMissing: true});
    const [fundList] = useOnyx(ONYXKEYS.FUND_LIST, {canBeMissing: true});
    const [bankAccountList = getEmptyObject<BankAccountList>()] = useOnyx(ONYXKEYS.BANK_ACCOUNT_LIST, {canBeMissing: true});
    const [reimbursementAccount] = useOnyx(ONYXKEYS.REIMBURSEMENT_ACCOUNT, {canBeMissing: true});
    const [chatReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${chatReportID}`, {canBeMissing: true});

    const {formatPhoneNumber} = useLocalize();

    const anchorRef = useRef<HTMLDivElement | View>(null);
    const transferBalanceButtonRef = useRef<HTMLDivElement | View | null>(null);

    const [shouldShowAddPaymentMenu, setShouldShowAddPaymentMenu] = useState(false);

    const [anchorPosition, setAnchorPosition] = useState({
        anchorPositionVertical: 0,
        anchorPositionHorizontal: 0,
    });

    const [lastPaymentMethod] = useOnyx(ONYXKEYS.NVP_LAST_PAYMENT_METHOD, {canBeMissing: true});

    const getAnchorPosition = useCallback(
        (domRect: DomRect): AnchorPosition => {
            if (anchorAlignment.vertical === CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.TOP) {
                return {
                    anchorPositionVertical: domRect.top + domRect.height + CONST.MODAL.POPOVER_MENU_PADDING,
                    anchorPositionHorizontal: domRect.left + POPOVER_MENU_ANCHOR_POSITION_HORIZONTAL_OFFSET,
                };
            }

            return {
                anchorPositionVertical: domRect.top - CONST.MODAL.POPOVER_MENU_PADDING,
                anchorPositionHorizontal: domRect.left,
            };
        },
        [anchorAlignment.vertical],
    );

    /**
     * Set position of the transfer payment menu
     */
    const setPositionAddPaymentMenu = ({anchorPositionVertical, anchorPositionHorizontal}: AnchorPosition) => {
        setAnchorPosition({
            anchorPositionVertical,
            anchorPositionHorizontal,
        });
    };

    const setMenuPosition = useCallback(() => {
        if (!transferBalanceButtonRef.current) {
            return;
        }

        const buttonPosition = getClickedTargetLocation(transferBalanceButtonRef.current as HTMLDivElement);
        const position = getAnchorPosition(buttonPosition);

        setPositionAddPaymentMenu(position);
    }, [getAnchorPosition]);

    const selectPaymentMethod = useCallback(
        (paymentMethod?: PaymentMethod, policy?: Policy) => {
            if (paymentMethod) {
                onSelectPaymentMethod(paymentMethod);
            }

            if (paymentMethod === CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT) {
                openPersonalBankAccountSetupView({shouldSetUpUSBankAccount: isIOUReport(iouReport)});
            } else if (paymentMethod === CONST.PAYMENT_METHODS.DEBIT_CARD) {
                Navigation.navigate(addDebitCardRoute ?? ROUTES.HOME);
            } else if (paymentMethod === CONST.PAYMENT_METHODS.BUSINESS_BANK_ACCOUNT || policy) {
                if (iouReport && isIOUReport(iouReport)) {
                    if (policy) {
                        const policyExpenseChatReportID = getPolicyExpenseChat(iouReport.ownerAccountID, policy.id)?.reportID;
                        if (!policyExpenseChatReportID) {
                            const {policyExpenseChatReportID: newPolicyExpenseChatReportID} = moveIOUReportToPolicyAndInviteSubmitter(iouReport.reportID, policy.id, formatPhoneNumber) ?? {};
                            savePreferredPaymentMethod(iouReport.policyID, policy.id, CONST.LAST_PAYMENT_METHOD.IOU, lastPaymentMethod?.[policy.id]);
                            Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(newPolicyExpenseChatReportID));
                        } else {
                            moveIOUReportToPolicy(iouReport.reportID, policy.id, true);
                            savePreferredPaymentMethod(iouReport.policyID, policy.id, CONST.LAST_PAYMENT_METHOD.IOU, lastPaymentMethod?.[policy.id]);
                            Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(policyExpenseChatReportID));
                        }

                        if (policy?.achAccount) {
                            return;
                        }
                        // Navigate to the bank account set up flow for this specific policy
                        Navigation.navigate(ROUTES.BANK_ACCOUNT_WITH_STEP_TO_OPEN.getRoute(policy.id));
                        return;
                    }

                    const {policyID, workspaceChatReportID, reportPreviewReportActionID, adminsChatReportID} = createWorkspaceFromIOUPayment(iouReport) ?? {};
                    if (policyID && iouReport?.policyID) {
                        savePreferredPaymentMethod(iouReport.policyID, policyID, CONST.LAST_PAYMENT_METHOD.IOU, lastPaymentMethod?.[iouReport?.policyID]);
                    }
                    completePaymentOnboarding(CONST.PAYMENT_SELECTED.BBA, adminsChatReportID, policyID);
                    if (workspaceChatReportID) {
                        Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(workspaceChatReportID, reportPreviewReportActionID));
                    }

                    // Navigate to the bank account set up flow for this specific policy
                    Navigation.navigate(ROUTES.BANK_ACCOUNT_WITH_STEP_TO_OPEN.getRoute(policyID));
                    return;
                }
                const bankAccountRoute = addBankAccountRoute ?? getBankAccountRoute(chatReport);
                Navigation.navigate(bankAccountRoute);
            }
        },
        [addBankAccountRoute, addDebitCardRoute, chatReport, iouReport, onSelectPaymentMethod, formatPhoneNumber, lastPaymentMethod],
    );

    /**
     * Take the position of the button that calls this method and show the Add Payment method menu when the user has no valid payment method.
     * If they do have a valid payment method they are navigated to the "enable payments" route to complete KYC checks.
     * If they are already KYC'd we will continue whatever action is gated behind the KYC wall.
     *
     */
    const continueAction = useCallback(
        (event?: GestureResponderEvent | KeyboardEvent, iouPaymentType?: PaymentMethodType, paymentMethod?: PaymentMethod, policy?: Policy) => {
            const currentSource = walletTerms?.source ?? source;

            /**
             * Set the source, so we can tailor the process according to how we got here.
             * We do not want to set this on mount, as the source can change upon completing the flow, e.g. when upgrading the wallet to Gold.
             */
            setKYCWallSource(source, chatReportID);

            if (shouldShowAddPaymentMenu) {
                setShouldShowAddPaymentMenu(false);
                return;
            }

            // Use event target as fallback if anchorRef is null for safety
            const targetElement = anchorRef.current ?? (event?.currentTarget as HTMLDivElement);

            transferBalanceButtonRef.current = targetElement;

            const isExpenseReport = isExpenseReportReportUtils(iouReport);
            const paymentCardList = fundList ?? {};

            // Check to see if user has a valid payment method on file and display the add payment popover if they don't
            if (
                (isExpenseReport && reimbursementAccount?.achData?.state !== CONST.BANK_ACCOUNT.STATE.OPEN) ||
                (!isExpenseReport && bankAccountList !== null && !hasExpensifyPaymentMethod(paymentCardList, bankAccountList, shouldIncludeDebitCard))
            ) {
                Log.info('[KYC Wallet] User does not have valid payment method');

                if (!shouldIncludeDebitCard) {
                    selectPaymentMethod(CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT);
                    return;
                }

                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                if (paymentMethod || policy) {
                    setShouldShowAddPaymentMenu(false);
                    selectPaymentMethod(paymentMethod, policy);
                    return;
                }

                if (iouPaymentType && isExpenseReport) {
                    setShouldShowAddPaymentMenu(false);
                    selectPaymentMethod(CONST.PAYMENT_METHODS.BUSINESS_BANK_ACCOUNT);
                    return;
                }

                const clickedElementLocation = getClickedTargetLocation(targetElement as HTMLDivElement);
                const position = getAnchorPosition(clickedElementLocation);

                setPositionAddPaymentMenu(position);
                setShouldShowAddPaymentMenu(true);

                return;
            }
            if (!isExpenseReport) {
                // Ask the user to upgrade to a gold wallet as this means they have not yet gone through our Know Your Customer (KYC) checks
                const hasActivatedWallet = userWallet?.tierName && [CONST.WALLET.TIER_NAME.GOLD, CONST.WALLET.TIER_NAME.PLATINUM].some((name) => name === userWallet.tierName);

                if (!hasActivatedWallet && !policy) {
                    Log.info('[KYC Wallet] User does not have active wallet');

                    Navigation.navigate(enablePaymentsRoute);

                    return;
                }

                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                if (policy || (paymentMethod && (!hasActivatedWallet || paymentMethod !== CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT))) {
                    setShouldShowAddPaymentMenu(false);
                    selectPaymentMethod(paymentMethod, policy);
                    return;
                }
            }

            Log.info('[KYC Wallet] User has valid payment method and passed KYC checks or did not need them');

            onSuccessfulKYC(iouPaymentType, currentSource);
        },
        [
            bankAccountList,
            chatReportID,
            enablePaymentsRoute,
            fundList,
            getAnchorPosition,
            iouReport,
            onSuccessfulKYC,
            reimbursementAccount?.achData?.state,
            selectPaymentMethod,
            shouldIncludeDebitCard,
            shouldShowAddPaymentMenu,
            source,
            userWallet?.tierName,
            walletTerms?.source,
        ],
    );

    useEffect(() => {
        let dimensionsSubscription: EmitterSubscription | null = null;

        kycWallRef.current = {continueAction};

        if (shouldListenForResize) {
            dimensionsSubscription = Dimensions.addEventListener('change', setMenuPosition);
        }

        return () => {
            if (shouldListenForResize && dimensionsSubscription) {
                dimensionsSubscription.remove();
            }

            kycWallRef.current = null;
        };
    }, [chatReportID, setMenuPosition, shouldListenForResize, continueAction]);

    return (
        <>
            <AddPaymentMethodMenu
                isVisible={shouldShowAddPaymentMenu}
                iouReport={iouReport}
                onClose={() => setShouldShowAddPaymentMenu(false)}
                anchorRef={anchorRef}
                anchorPosition={{
                    vertical: anchorPosition.anchorPositionVertical,
                    horizontal: anchorPosition.anchorPositionHorizontal,
                }}
                anchorAlignment={anchorAlignment}
                onItemSelected={(item: PaymentMethod) => {
                    setShouldShowAddPaymentMenu(false);
                    selectPaymentMethod(item);
                }}
                shouldShowPersonalBankAccountOption={shouldShowPersonalBankAccountOption}
            />
            {children(continueAction, viewRef(anchorRef))}
        </>
    );
}

KYCWall.displayName = 'BaseKYCWall';

export default KYCWall;
