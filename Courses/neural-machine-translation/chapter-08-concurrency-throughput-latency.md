# Chapter 8: Concurrency, Throughput & Latency

---

When a translation model is deployed in production, it rarely serves one request at a time. Multiple users, applications, or batch jobs submit requests simultaneously. How well the system handles this load — and how that load is balanced against response speed — is determined by three interconnected metrics: concurrency, throughput, and latency.

These terms are often used loosely or interchangeably, but they measure fundamentally different things. Confusing them leads to poor capacity planning, misdiagnosed bottlenecks, and SLAs that do not reflect actual user experience.

---

## 8.1 Core Definitions

### Latency

Latency is the time it takes for a single translation request to complete — from the moment the request is received to the moment the translated text is returned to the caller.

For translation specifically, latency has two meaningful sub-components:

- **Time to First Token (TTFT):** how long before the system starts returning output. For streaming responses, this is what the user perceives as responsiveness.
- **Time Per Output Token (TPOT):** the average time between each successive generated token. Multiplied by the number of output tokens, this determines how long the full translation takes to complete.

End-to-end latency is approximately:

> End-to-end latency ≈ TTFT + (number of output tokens × TPOT)

A system with low TTFT but high TPOT will feel fast to start but slow to finish. A system with high TTFT but low TPOT will feel sluggish initially but complete quickly once generation begins. Both matter — but for different use cases. Real-time chat translation prioritizes TTFT; batch document translation cares more about total completion time.

### Throughput

Throughput is the number of requests — or tokens — the system processes per unit of time. Common units:

- **Requests per second (RPS):** how many translation jobs the system completes per second
- **Tokens per second (TPS):** how many output tokens the system generates per second across all active requests

Throughput is a measure of the system's total productive capacity, regardless of how fast any individual request is served. A system with high throughput can process a large volume of work in a given time window, even if individual requests take a while.

### Concurrency

Concurrency is the number of requests being actively processed by the system at the same moment. A system with a concurrency of 32 is simultaneously running 32 translation requests through the model.

Concurrency is constrained by GPU memory. Each active request occupies KV-cache memory proportional to its sequence length. When GPU memory is exhausted, no new requests can be loaded — they must wait in a queue. The maximum sustainable concurrency is therefore determined by how much memory each request consumes and how much total GPU memory is available.

---

## 8.2 How They Interact

The three metrics are not independent. Changing one directly affects the others, and optimizing for one often comes at the expense of another.

### The Batching Trade-off

GPUs are designed for massive parallelism — they perform best when given large amounts of work to do simultaneously. Running a single translation request at a time leaves most of the GPU idle. Grouping multiple requests into a **batch** and processing them together dramatically improves GPU utilization and increases throughput.

However, batching introduces a latency cost. In a static batch, the system waits until it has collected enough requests to fill the batch before processing any of them. The last request to arrive in that batch has already been waiting for the batch to fill — its latency includes that waiting time on top of the actual processing time.

This creates a direct tension:
- **Larger batches** → higher GPU utilization → higher throughput → higher latency per request
- **Smaller batches** → lower GPU utilization → lower throughput → lower latency per request

The right batch size is not a universal constant — it depends on the latency target the system must meet.

### Queue Depth and Hidden Latency

When all GPU capacity is occupied and new requests arrive, they enter a queue and wait. The time a request spends waiting in the queue adds to its total observed latency but is invisible to the model — the model is not doing any work for that request during this time.

Queue depth is the number of requests waiting to be processed. In a well-tuned system, queue depth stays near zero under normal load and grows only during traffic spikes. Persistent queue growth indicates the system is undersized for its load — throughput cannot keep up with the incoming request rate.

From a user perspective, queue latency is indistinguishable from processing latency. Both feel like the system is slow. Monitoring queue depth separately from processing time is important for diagnosing whether latency issues are caused by model performance or capacity shortfalls.

### GPU Utilization and the Efficiency Curve

GPU utilization measures what fraction of the GPU's compute capacity is actively being used. At low concurrency, utilization is low — the hardware is underused. As concurrency and batch size increase, utilization rises and throughput improves. But there is a ceiling: once GPU memory is fully occupied, adding more requests does not improve throughput and instead increases queue depth and latency.

The relationship between batch size and throughput follows a curve that flattens as batch size grows. Doubling the batch size from 1 to 2 roughly doubles throughput. Doubling it from 32 to 64 may yield only a marginal improvement — the GPU is already well-utilized, and the overhead of managing a larger batch begins to offset the gains.

---

## 8.3 Practical Tuning

### Choosing Batch Size for a Latency SLA

A Service Level Agreement (SLA) defines the maximum acceptable latency for a given percentile of requests — for example, "95% of requests must complete within 2 seconds." The batch size should be chosen so that the system meets this SLA under expected load.

The practical approach:
1. Determine the latency budget — the maximum end-to-end latency the system must deliver at the target percentile
2. Measure processing time per request at different batch sizes under realistic load
3. Choose the largest batch size that keeps latency within the budget, leaving headroom for traffic spikes

For latency-sensitive deployments (real-time chat translation, interactive tools), batch sizes are typically small — 1 to 8. For throughput-oriented workloads (overnight document batch processing), batch sizes of 32 to 128 or more are appropriate.

### Static Batching vs. Continuous Batching

**Static batching** collects a fixed number of requests, processes them together as a batch, and waits for all requests in the batch to finish before accepting new ones. This is simple to implement but inefficient: requests of different lengths are padded to match the longest sequence in the batch, wasting compute on padding tokens. Additionally, the entire batch must complete before any new request can be admitted — a few slow, long requests block the batch for all others.

**Continuous batching** (also called dynamic or iteration-level batching) processes requests at the token generation level rather than the request level. New requests are inserted into the batch as soon as a slot becomes available — when any existing request finishes generating its current token and produces an end-of-sequence token, it is removed and a waiting request takes its place.

The result is that GPU capacity is never blocked waiting for slow requests to finish. Short requests complete quickly and free up slots for new ones, while long requests continue generating in the remaining slots. This keeps GPU utilization high while minimizing the time any individual request spends waiting in the queue.

Continuous batching is the standard approach in modern inference engines and is a primary reason why production translation systems can serve high concurrency with relatively low latency compared to static batching systems of the same hardware capacity.

### Monitoring the Right Metrics

Effective production monitoring requires tracking all three dimensions:

| Metric | What It Reveals |
|---|---|
| P50 / P95 / P99 latency | Whether the SLA is being met across the distribution of requests |
| Throughput (RPS / TPS) | Whether the system is keeping up with incoming load |
| GPU utilization | Whether the hardware is being used efficiently |
| Queue depth | Whether capacity is sufficient or requests are waiting |
| TTFT | Whether initial responsiveness meets user expectations |
| KV-cache utilization | Whether memory is the binding constraint on concurrency |

Latency spikes that coincide with rising queue depth point to a capacity problem. Latency spikes without queue growth point to a model or request-level issue — unusually long inputs, high beam widths, or outlier sequence lengths.
