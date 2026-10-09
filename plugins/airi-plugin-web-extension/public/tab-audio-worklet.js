/* global AudioWorkletProcessor, sampleRate, registerProcessor */

/** Emits bounded mono PCM observations. Silent chunks stay local and are discarded. */
class TabAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Float32Array(16000 * 12)
    this.offset = 0
    this.squares = 0
    this.cooldown = 0
    this.phase = 0
    this.sum = 0
    this.count = 0
    this.generation = 0
    this.port.onmessage = ({ data }) => {
      if (data?.type !== 'reset' || !Number.isInteger(data.generation))
        return
      this.generation = data.generation
      this.offset = 0
      this.squares = 0
      this.cooldown = 0
      this.phase = 0
      this.sum = 0
      this.count = 0
    }
  }

  process(inputs) {
    const channels = inputs[0]
    if (!channels?.length)
      return true
    for (let i = 0; i < channels[0].length; i++) {
      if (this.cooldown > 0) {
        this.cooldown--
        continue
      }
      let value = 0
      for (const channel of channels)
        value += channel[i] / channels.length
      // Average source samples into the perception copy. The audible stream bypasses this worklet entirely.
      this.sum += value
      this.count++
      this.phase += 16000
      if (this.phase < sampleRate)
        continue
      this.phase -= sampleRate
      const mono = this.sum / this.count
      this.sum = 0
      this.count = 0
      this.samples[this.offset++] = mono
      this.squares += mono * mono
      if (this.offset === this.samples.length) {
        if (Math.sqrt(this.squares / this.offset) > 0.002) {
          const chunk = this.samples.slice()
          this.port.postMessage({ samples: chunk, generation: this.generation }, [chunk.buffer])
        }
        this.offset = 0
        this.squares = 0
        this.cooldown = sampleRate * 8
      }
    }
    return true
  }
}

registerProcessor('airi-tab-audio', TabAudioProcessor)
