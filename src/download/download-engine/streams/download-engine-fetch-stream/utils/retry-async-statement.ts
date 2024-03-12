import retry from "async-retry";

export function promiseWithResolvers<Resolve = void>() {
    let resolve: (value: Resolve) => void;
    let reject: (reason: unknown) => void;
    const promise = new Promise<Resolve>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });

    return {promise, resolve: resolve!, reject: reject!};
}

function retryAsyncStatement(options?: retry.Options) {
    const resolvers = promiseWithResolvers();
    const waitResolvers = promiseWithResolvers();

    const promiseWithRetry = retry(async () => {
        try {
            waitResolvers.resolve();
            Object.assign(waitResolvers, promiseWithResolvers());
            await resolvers.promise;
        } catch (error) {
            Object.assign(resolvers, promiseWithResolvers());
            throw error;
        }
    }, options);

    promiseWithRetry.catch((reason) => {
        waitResolvers.reject(reason);
    });

    promiseWithRetry.then((value) => {
        waitResolvers.resolve(value);
    });

    return {
        waitResolvers,
        resolvers
    };
}

export function retryAsyncStatementSimple(options?: retry.Options) {
    const retryState = retryAsyncStatement(options);

    return (reason = new Error()) => {
        retryState.resolvers.reject(reason);
        return retryState.waitResolvers.promise;
    };
}
