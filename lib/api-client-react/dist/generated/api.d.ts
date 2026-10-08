import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { AnalysisHistoryResponse, AnalysisRecord, AnalysisResult, AnalyzeRequest, BillingPlansResponse, CostEstimate, CreateFeedbackRequest, CreateOrderRequest, CreateOrderResponse, CreditsResponse, DeleteResponse, DueFollowUpsResponse, ErrorResponse, FeedbackItem, FeedbackListResponse, GetAnalysisHistoryParams, GetFeedbackListParams, HealthStatus, InsufficientCreditsResponse, RedeemReferralRequest, RedeemReferralResponse, ReferralSummary, SubscriptionStatus, VerifyPaymentRequest } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Exact credit cost of analysing this situation (modules involved + reasoning level), before anything is charged
 */
export declare const getEstimateAnalysisCostUrl: () => string;
export declare const estimateAnalysisCost: (analyzeRequest: AnalyzeRequest, options?: RequestInit) => Promise<CostEstimate>;
export declare const getEstimateAnalysisCostMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof estimateAnalysisCost>>, TError, {
        data: BodyType<AnalyzeRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof estimateAnalysisCost>>, TError, {
    data: BodyType<AnalyzeRequest>;
}, TContext>;
export type EstimateAnalysisCostMutationResult = NonNullable<Awaited<ReturnType<typeof estimateAnalysisCost>>>;
export type EstimateAnalysisCostMutationBody = BodyType<AnalyzeRequest>;
export type EstimateAnalysisCostMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Exact credit cost of analysing this situation (modules involved + reasoning level), before anything is charged
 */
export declare const useEstimateAnalysisCost: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof estimateAnalysisCost>>, TError, {
        data: BodyType<AnalyzeRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof estimateAnalysisCost>>, TError, {
    data: BodyType<AnalyzeRequest>;
}, TContext>;
/**
 * @summary Analyze a situation
 */
export declare const getAnalyzeSituationUrl: () => string;
export declare const analyzeSituation: (analyzeRequest: AnalyzeRequest, options?: RequestInit) => Promise<AnalysisResult>;
export declare const getAnalyzeSituationMutationOptions: <TError = ErrorType<ErrorResponse | InsufficientCreditsResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof analyzeSituation>>, TError, {
        data: BodyType<AnalyzeRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof analyzeSituation>>, TError, {
    data: BodyType<AnalyzeRequest>;
}, TContext>;
export type AnalyzeSituationMutationResult = NonNullable<Awaited<ReturnType<typeof analyzeSituation>>>;
export type AnalyzeSituationMutationBody = BodyType<AnalyzeRequest>;
export type AnalyzeSituationMutationError = ErrorType<ErrorResponse | InsufficientCreditsResponse>;
/**
 * @summary Analyze a situation
 */
export declare const useAnalyzeSituation: <TError = ErrorType<ErrorResponse | InsufficientCreditsResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof analyzeSituation>>, TError, {
        data: BodyType<AnalyzeRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof analyzeSituation>>, TError, {
    data: BodyType<AnalyzeRequest>;
}, TContext>;
/**
 * @summary Get analysis history
 */
export declare const getGetAnalysisHistoryUrl: (params?: GetAnalysisHistoryParams) => string;
export declare const getAnalysisHistory: (params?: GetAnalysisHistoryParams, options?: RequestInit) => Promise<AnalysisHistoryResponse>;
export declare const getGetAnalysisHistoryQueryKey: (params?: GetAnalysisHistoryParams) => readonly ["/api/analysis/history", ...GetAnalysisHistoryParams[]];
export declare const getGetAnalysisHistoryQueryOptions: <TData = Awaited<ReturnType<typeof getAnalysisHistory>>, TError = ErrorType<unknown>>(params?: GetAnalysisHistoryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalysisHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAnalysisHistory>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAnalysisHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof getAnalysisHistory>>>;
export type GetAnalysisHistoryQueryError = ErrorType<unknown>;
/**
 * @summary Get analysis history
 */
export declare function useGetAnalysisHistory<TData = Awaited<ReturnType<typeof getAnalysisHistory>>, TError = ErrorType<unknown>>(params?: GetAnalysisHistoryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalysisHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get analysis by ID
 */
export declare const getGetAnalysisByIdUrl: (id: number) => string;
export declare const getAnalysisById: (id: number, options?: RequestInit) => Promise<AnalysisRecord>;
export declare const getGetAnalysisByIdQueryKey: (id: number) => readonly [`/api/analysis/history/${number}`];
export declare const getGetAnalysisByIdQueryOptions: <TData = Awaited<ReturnType<typeof getAnalysisById>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalysisById>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAnalysisById>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAnalysisByIdQueryResult = NonNullable<Awaited<ReturnType<typeof getAnalysisById>>>;
export type GetAnalysisByIdQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get analysis by ID
 */
export declare function useGetAnalysisById<TData = Awaited<ReturnType<typeof getAnalysisById>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalysisById>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Delete an analysis
 */
export declare const getDeleteAnalysisUrl: (id: number) => string;
export declare const deleteAnalysis: (id: number, options?: RequestInit) => Promise<DeleteResponse>;
export declare const getDeleteAnalysisMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAnalysis>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteAnalysis>>, TError, {
    id: number;
}, TContext>;
export type DeleteAnalysisMutationResult = NonNullable<Awaited<ReturnType<typeof deleteAnalysis>>>;
export type DeleteAnalysisMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Delete an analysis
 */
export declare const useDeleteAnalysis: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAnalysis>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteAnalysis>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Predictions whose time window has passed and are waiting for the user's feedback
 */
export declare const getGetDueFollowUpsUrl: () => string;
export declare const getDueFollowUps: (options?: RequestInit) => Promise<DueFollowUpsResponse>;
export declare const getGetDueFollowUpsQueryKey: () => readonly ["/api/analysis/followups/due"];
export declare const getGetDueFollowUpsQueryOptions: <TData = Awaited<ReturnType<typeof getDueFollowUps>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDueFollowUps>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDueFollowUps>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDueFollowUpsQueryResult = NonNullable<Awaited<ReturnType<typeof getDueFollowUps>>>;
export type GetDueFollowUpsQueryError = ErrorType<unknown>;
/**
 * @summary Predictions whose time window has passed and are waiting for the user's feedback
 */
export declare function useGetDueFollowUps<TData = Awaited<ReturnType<typeof getDueFollowUps>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDueFollowUps>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Ask again later
 */
export declare const getSnoozeFollowUpUrl: (id: number) => string;
export declare const snoozeFollowUp: (id: number, options?: RequestInit) => Promise<DeleteResponse>;
export declare const getSnoozeFollowUpMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof snoozeFollowUp>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof snoozeFollowUp>>, TError, {
    id: number;
}, TContext>;
export type SnoozeFollowUpMutationResult = NonNullable<Awaited<ReturnType<typeof snoozeFollowUp>>>;
export type SnoozeFollowUpMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Ask again later
 */
export declare const useSnoozeFollowUp: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof snoozeFollowUp>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof snoozeFollowUp>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Never ask about this prediction again
 */
export declare const getDismissFollowUpUrl: (id: number) => string;
export declare const dismissFollowUp: (id: number, options?: RequestInit) => Promise<DeleteResponse>;
export declare const getDismissFollowUpMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof dismissFollowUp>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof dismissFollowUp>>, TError, {
    id: number;
}, TContext>;
export type DismissFollowUpMutationResult = NonNullable<Awaited<ReturnType<typeof dismissFollowUp>>>;
export type DismissFollowUpMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Never ask about this prediction again
 */
export declare const useDismissFollowUp: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof dismissFollowUp>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof dismissFollowUp>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Subscription plans with the full price breakdown (INR)
 */
export declare const getGetBillingPlansUrl: () => string;
export declare const getBillingPlans: (options?: RequestInit) => Promise<BillingPlansResponse>;
export declare const getGetBillingPlansQueryKey: () => readonly ["/api/billing/plans"];
export declare const getGetBillingPlansQueryOptions: <TData = Awaited<ReturnType<typeof getBillingPlans>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBillingPlans>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getBillingPlans>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetBillingPlansQueryResult = NonNullable<Awaited<ReturnType<typeof getBillingPlans>>>;
export type GetBillingPlansQueryError = ErrorType<unknown>;
/**
 * @summary Subscription plans with the full price breakdown (INR)
 */
export declare function useGetBillingPlans<TData = Awaited<ReturnType<typeof getBillingPlans>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBillingPlans>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary The signed-in user's subscription
 */
export declare const getGetSubscriptionStatusUrl: () => string;
export declare const getSubscriptionStatus: (options?: RequestInit) => Promise<SubscriptionStatus>;
export declare const getGetSubscriptionStatusQueryKey: () => readonly ["/api/billing/status"];
export declare const getGetSubscriptionStatusQueryOptions: <TData = Awaited<ReturnType<typeof getSubscriptionStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSubscriptionStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSubscriptionStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSubscriptionStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getSubscriptionStatus>>>;
export type GetSubscriptionStatusQueryError = ErrorType<unknown>;
/**
 * @summary The signed-in user's subscription
 */
export declare function useGetSubscriptionStatus<TData = Awaited<ReturnType<typeof getSubscriptionStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSubscriptionStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Credit balance and recent credit history of the signed-in user
 */
export declare const getGetCreditsUrl: () => string;
export declare const getCredits: (options?: RequestInit) => Promise<CreditsResponse>;
export declare const getGetCreditsQueryKey: () => readonly ["/api/billing/credits"];
export declare const getGetCreditsQueryOptions: <TData = Awaited<ReturnType<typeof getCredits>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCredits>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCredits>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCreditsQueryResult = NonNullable<Awaited<ReturnType<typeof getCredits>>>;
export type GetCreditsQueryError = ErrorType<unknown>;
/**
 * @summary Credit balance and recent credit history of the signed-in user
 */
export declare function useGetCredits<TData = Awaited<ReturnType<typeof getCredits>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCredits>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Start a Razorpay checkout for a plan, a top-up pack or a single-query credit purchase (the amount is computed on the server)
 */
export declare const getCreateBillingOrderUrl: () => string;
export declare const createBillingOrder: (createOrderRequest: CreateOrderRequest, options?: RequestInit) => Promise<CreateOrderResponse>;
export declare const getCreateBillingOrderMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createBillingOrder>>, TError, {
        data: BodyType<CreateOrderRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createBillingOrder>>, TError, {
    data: BodyType<CreateOrderRequest>;
}, TContext>;
export type CreateBillingOrderMutationResult = NonNullable<Awaited<ReturnType<typeof createBillingOrder>>>;
export type CreateBillingOrderMutationBody = BodyType<CreateOrderRequest>;
export type CreateBillingOrderMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Start a Razorpay checkout for a plan, a top-up pack or a single-query credit purchase (the amount is computed on the server)
 */
export declare const useCreateBillingOrder: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createBillingOrder>>, TError, {
        data: BodyType<CreateOrderRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createBillingOrder>>, TError, {
    data: BodyType<CreateOrderRequest>;
}, TContext>;
/**
 * @summary Invite a friend - the signed-in user's invite code, how many friends joined and paid, and the discount waiting for their next purchase
 */
export declare const getGetReferralUrl: () => string;
export declare const getReferral: (options?: RequestInit) => Promise<ReferralSummary>;
export declare const getGetReferralQueryKey: () => readonly ["/api/referral"];
export declare const getGetReferralQueryOptions: <TData = Awaited<ReturnType<typeof getReferral>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getReferral>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getReferral>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetReferralQueryResult = NonNullable<Awaited<ReturnType<typeof getReferral>>>;
export type GetReferralQueryError = ErrorType<unknown>;
/**
 * @summary Invite a friend - the signed-in user's invite code, how many friends joined and paid, and the discount waiting for their next purchase
 */
export declare function useGetReferral<TData = Awaited<ReturnType<typeof getReferral>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getReferral>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Apply a friend's invite code (once, before the first payment)
 */
export declare const getRedeemReferralCodeUrl: () => string;
export declare const redeemReferralCode: (redeemReferralRequest: RedeemReferralRequest, options?: RequestInit) => Promise<RedeemReferralResponse>;
export declare const getRedeemReferralCodeMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof redeemReferralCode>>, TError, {
        data: BodyType<RedeemReferralRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof redeemReferralCode>>, TError, {
    data: BodyType<RedeemReferralRequest>;
}, TContext>;
export type RedeemReferralCodeMutationResult = NonNullable<Awaited<ReturnType<typeof redeemReferralCode>>>;
export type RedeemReferralCodeMutationBody = BodyType<RedeemReferralRequest>;
export type RedeemReferralCodeMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Apply a friend's invite code (once, before the first payment)
 */
export declare const useRedeemReferralCode: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof redeemReferralCode>>, TError, {
        data: BodyType<RedeemReferralRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof redeemReferralCode>>, TError, {
    data: BodyType<RedeemReferralRequest>;
}, TContext>;
/**
 * @summary Confirm a Checkout payment (verifies Razorpay's signature) and activate the subscription
 */
export declare const getVerifyBillingPaymentUrl: () => string;
export declare const verifyBillingPayment: (verifyPaymentRequest: VerifyPaymentRequest, options?: RequestInit) => Promise<SubscriptionStatus>;
export declare const getVerifyBillingPaymentMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof verifyBillingPayment>>, TError, {
        data: BodyType<VerifyPaymentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof verifyBillingPayment>>, TError, {
    data: BodyType<VerifyPaymentRequest>;
}, TContext>;
export type VerifyBillingPaymentMutationResult = NonNullable<Awaited<ReturnType<typeof verifyBillingPayment>>>;
export type VerifyBillingPaymentMutationBody = BodyType<VerifyPaymentRequest>;
export type VerifyBillingPaymentMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Confirm a Checkout payment (verifies Razorpay's signature) and activate the subscription
 */
export declare const useVerifyBillingPayment: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof verifyBillingPayment>>, TError, {
        data: BodyType<VerifyPaymentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof verifyBillingPayment>>, TError, {
    data: BodyType<VerifyPaymentRequest>;
}, TContext>;
/**
 * @summary Submit feedback for an analysis
 */
export declare const getCreateFeedbackUrl: () => string;
export declare const createFeedback: (createFeedbackRequest: CreateFeedbackRequest, options?: RequestInit) => Promise<FeedbackItem>;
export declare const getCreateFeedbackMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFeedback>>, TError, {
        data: BodyType<CreateFeedbackRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createFeedback>>, TError, {
    data: BodyType<CreateFeedbackRequest>;
}, TContext>;
export type CreateFeedbackMutationResult = NonNullable<Awaited<ReturnType<typeof createFeedback>>>;
export type CreateFeedbackMutationBody = BodyType<CreateFeedbackRequest>;
export type CreateFeedbackMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Submit feedback for an analysis
 */
export declare const useCreateFeedback: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFeedback>>, TError, {
        data: BodyType<CreateFeedbackRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createFeedback>>, TError, {
    data: BodyType<CreateFeedbackRequest>;
}, TContext>;
/**
 * @summary Get all feedback (optionally filtered by analysis)
 */
export declare const getGetFeedbackListUrl: (params?: GetFeedbackListParams) => string;
export declare const getFeedbackList: (params?: GetFeedbackListParams, options?: RequestInit) => Promise<FeedbackListResponse>;
export declare const getGetFeedbackListQueryKey: (params?: GetFeedbackListParams) => readonly ["/api/feedback", ...GetFeedbackListParams[]];
export declare const getGetFeedbackListQueryOptions: <TData = Awaited<ReturnType<typeof getFeedbackList>>, TError = ErrorType<unknown>>(params?: GetFeedbackListParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFeedbackList>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFeedbackList>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFeedbackListQueryResult = NonNullable<Awaited<ReturnType<typeof getFeedbackList>>>;
export type GetFeedbackListQueryError = ErrorType<unknown>;
/**
 * @summary Get all feedback (optionally filtered by analysis)
 */
export declare function useGetFeedbackList<TData = Awaited<ReturnType<typeof getFeedbackList>>, TError = ErrorType<unknown>>(params?: GetFeedbackListParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFeedbackList>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Delete feedback
 */
export declare const getDeleteFeedbackUrl: (id: number) => string;
export declare const deleteFeedback: (id: number, options?: RequestInit) => Promise<DeleteResponse>;
export declare const getDeleteFeedbackMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteFeedback>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteFeedback>>, TError, {
    id: number;
}, TContext>;
export type DeleteFeedbackMutationResult = NonNullable<Awaited<ReturnType<typeof deleteFeedback>>>;
export type DeleteFeedbackMutationError = ErrorType<unknown>;
/**
 * @summary Delete feedback
 */
export declare const useDeleteFeedback: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteFeedback>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteFeedback>>, TError, {
    id: number;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map