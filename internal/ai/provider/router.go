package provider

import "context"

type Router struct {
	custom       ChatClient
	subscription ChatClient
}

func NewRouter(custom ChatClient, subscription ChatClient) *Router {
	return &Router{
		custom:       custom,
		subscription: subscription,
	}
}

func (r *Router) Chat(ctx context.Context, request ChatRequest) (string, error) {
	if request.Settings.Mode == ModeSubscription {
		return r.subscription.Chat(ctx, request)
	}

	return r.custom.Chat(ctx, request)
}
