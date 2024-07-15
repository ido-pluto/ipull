export function concurrency<Value>(array: Value[], concurrencyCount: number, callback: (value: Value) => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
        let index = 0;
        let activeCount = 0;

        function next() {
            if (index === array.length && activeCount === 0) {
                resolve();
                return;
            }

            while (activeCount < concurrencyCount && index < array.length) {
                activeCount++;
                callback(array[index++])
                    .then(() => {
                        activeCount--;
                        next();
                    }, reject);
            }
        }

        next();
    });
}
