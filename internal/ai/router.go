package ai

import "context"

type Generator interface {
	Generate(context.Context, GenerationRequest) (string, error)
}

type Router struct {
	custom       Generator
	subscription Generator
}

func NewRouter(custom Generator, subscription Generator) *Router {
	return &Router{
		custom:       custom,
		subscription: subscription,
	}
}

func (r *Router) Route(ctx context.Context, request GenerationRequest) (string, error) {
	if request.Settings.Mode == ModeSubscription {
		return r.subscription.Generate(ctx, request)
	}

	return r.custom.Generate(ctx, request)
}
