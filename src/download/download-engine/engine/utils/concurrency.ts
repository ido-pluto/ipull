export function concurrency<Value>(array: Value[], concurrencyCount: number, callback: (value: Value) => Promise<void>) {
    const {resolve, reject, promise} = Promise.withResolvers<void>();
    let index = 0;
    let activeCount = 0;

    function reload() {
        if (index === array.length && activeCount === 0) {
            resolve();
            return;
        }

        while (activeCount < concurrencyCount && index < array.length) {
            activeCount++;
            callback(array[index++])
                .then(() => {
                    activeCount--;
                    reload();
                }, reject);
        }
    }

    reload();

    return {
        promise,
        reload
    };
}
